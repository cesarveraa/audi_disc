from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import psycopg
from google.cloud import firestore
from psycopg import sql
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client  # noqa: E402


DEFAULT_DSN = "postgresql://postgres:admin@localhost:5432/Audi_disc"
DEFAULT_TABLE = "producto"
MAX_BATCH_WRITES = 450


@dataclass(frozen=True)
class LegacyProduct:
    legacy_id: int
    nombre: str
    cantidad: int
    precio_compra_centavos: int
    precio_venta_centavos: int
    estado: bool


def money_to_centavos(value: Any) -> int:
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def normalize_product(row: dict[str, Any]) -> LegacyProduct:
    legacy_id = int(row.get("cpro") or row.get("id") or 0)
    nombre = str(row.get("producto") or row.get("nombre") or "").strip()
    if not legacy_id:
        raise ValueError(f"Producto sin cpro/id valido: {row}")
    if not nombre:
        raise ValueError(f"Producto {legacy_id} sin nombre")

    return LegacyProduct(
        legacy_id=legacy_id,
        nombre=nombre,
        cantidad=max(0, int(row.get("cantidad") or 0)),
        precio_compra_centavos=money_to_centavos(row.get("preciocompra") or row.get("precio_compra")),
        precio_venta_centavos=money_to_centavos(row.get("precioventa") or row.get("precio_venta")),
        estado=bool(row.get("estado", True)),
    )


def _table_identifier(table: str) -> sql.Composed:
    parts = [part.strip() for part in table.split(".") if part.strip()]
    if not parts or len(parts) > 2:
        raise ValueError("El nombre de tabla debe ser 'producto' o 'schema.producto'")
    return sql.SQL(".").join(sql.Identifier(part) for part in parts)


def product_doc(product: LegacyProduct, table: str) -> dict[str, Any]:
    now = firestore.SERVER_TIMESTAMP
    return {
        "nombre": product.nombre,
        "marca": None,
        "sku": f"LEG-{product.legacy_id}",
        "categoria": "Migrado Java",
        "cantidad": product.cantidad,
        "stockMinimo": int(os.getenv("MIGRATION_DEFAULT_STOCK_MINIMO", "3")),
        "precioCompraCentavos": product.precio_compra_centavos,
        "precioVentaCentavos": product.precio_venta_centavos,
        "estado": product.estado,
        "createdAt": now,
        "updatedAt": now,
        "createdBy": "migration:postgres",
        "updatedBy": "migration:postgres",
        "migration": {
            "source": "SI_proyectoVenta-main",
            "legacyTable": table,
            "legacyId": product.legacy_id,
        },
    }


def fetch_legacy_products(dsn: str, table: str, include_inactive: bool) -> list[LegacyProduct]:
    where_clause = sql.SQL("") if include_inactive else sql.SQL("WHERE estado = true")
    query = sql.SQL(
        "SELECT cpro, producto, cantidad, preciocompra, precioventa, estado "
        "FROM {table} {where_clause} ORDER BY cpro"
    ).format(
        table=_table_identifier(table),
        where_clause=where_clause,
    )
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            return [normalize_product(dict(row)) for row in cursor.fetchall()]


def upload_products(products: list[LegacyProduct], table: str, dry_run: bool) -> None:
    if dry_run:
        for product in products:
            data = product_doc(product, table)
            print(f"[dry-run] legacy-{product.legacy_id}: {data['nombre']} ({data['cantidad']})")
        print(f"Migracion completada: {len(products)} productos simulados")
        return

    db = get_firestore_client()
    batch = db.batch()
    pending = 0
    total = 0

    for product in products:
        doc_ref = db.collection("productos").document(f"legacy-{product.legacy_id}")
        data = product_doc(product, table)

        batch.set(doc_ref, data, merge=True)
        pending += 1
        total += 1
        if pending >= MAX_BATCH_WRITES:
            batch.commit()
            print(f"Committed {total} productos...")
            batch = db.batch()
            pending = 0

    if pending:
        batch.commit()
    print(f"Migracion completada: {total} productos subidos")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migra inventario Java/PostgreSQL a Firestore.")
    parser.add_argument("--dsn", default=os.getenv("POSTGRES_DSN", DEFAULT_DSN))
    parser.add_argument("--table", default=os.getenv("POSTGRES_PRODUCT_TABLE", DEFAULT_TABLE))
    parser.add_argument("--include-inactive", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    products = fetch_legacy_products(args.dsn, args.table, args.include_inactive)
    print(f"Productos encontrados: {len(products)}")
    upload_products(products, args.table, args.dry_run)


if __name__ == "__main__":
    main()
