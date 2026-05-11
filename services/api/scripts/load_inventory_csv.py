from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import pandas as pd
from google.cloud import firestore

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_STOCK_MINIMO = 5
MAX_BATCH_WRITES = 450
REQUIRED_COLUMNS = {
    "articulo": "Articulo",
    "cantidad": "cantidad",
    "codebarre": "codebarre",
    "precio_venta": "Precio_Venta",
}


@dataclass(frozen=True)
class ParsedProduct:
    row_number: int
    nombre: str
    cantidad: int
    sku: str
    precio_venta_centavos: int
    warnings: list[str]


@dataclass(frozen=True)
class RowError:
    row_number: int
    reason: str
    raw: dict[str, Any]


def _clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return re.sub(r"\s+", " ", text)


def _normalize_column_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().casefold()).strip("_")


def _column_map(df: pd.DataFrame) -> dict[str, str]:
    normalized_to_actual = {_normalize_column_name(column): column for column in df.columns}
    missing = [actual for normalized, actual in REQUIRED_COLUMNS.items() if normalized not in normalized_to_actual]
    if missing:
        raise ValueError(f"Columnas requeridas faltantes: {', '.join(missing)}")
    return {
        "nombre": normalized_to_actual["articulo"],
        "cantidad": normalized_to_actual["cantidad"],
        "sku": normalized_to_actual["codebarre"],
        "precio_venta": normalized_to_actual["precio_venta"],
    }


def _parse_int(value: Any, field: str) -> int:
    text = _clean_text(value)
    if not text:
        raise ValueError(f"{field} vacio")
    try:
        decimal_value = Decimal(text.replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError(f"{field} no es entero valido: {text}") from exc
    if decimal_value != decimal_value.to_integral_value():
        raise ValueError(f"{field} debe ser entero: {text}")
    return int(decimal_value)


def _parse_price_centavos(value: Any) -> int:
    text = _clean_text(value)
    if not text:
        raise ValueError("Precio_Venta vacio")
    normalized = text.replace("Bs", "").replace("bs", "").replace(" ", "")
    if "," in normalized and "." in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    else:
        normalized = normalized.replace(",", ".")
    try:
        amount = Decimal(normalized).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError(f"Precio_Venta invalido: {text}") from exc
    if amount < 0:
        raise ValueError(f"Precio_Venta negativo: {text}")
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def _document_id(sku: str, row_number: int) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", sku).strip("-")
    suffix = safe[:90] if safe else "sin-sku"
    return f"csv-r{row_number}-{suffix}"


def _default_input_path() -> Path:
    candidates = [
        WORKSPACE_ROOT / "productos.xlsx",
        WORKSPACE_ROOT / "productos.csv",
        WORKSPACE_ROOT / "productos.xlsx - Sheet1.csv",
        REPO_ROOT / "productos.xlsx",
        REPO_ROOT / "productos.csv",
        REPO_ROOT / "productos.xlsx - Sheet1.csv",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "No encontre productos.xlsx/productos.csv en C:\\a ni en la raiz del repo. "
        "Usa --file C:\\ruta\\archivo.csv"
    )


def read_products_file(path: Path) -> pd.DataFrame:
    suffix = path.suffix.casefold()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, sheet_name=0, dtype=str)
    if suffix == ".csv":
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                return pd.read_csv(path, sep=None, engine="python", dtype=str, encoding=encoding)
            except UnicodeDecodeError:
                continue
        return pd.read_csv(path, sep=None, engine="python", dtype=str)
    raise ValueError(f"Formato no soportado: {path.suffix}. Usa CSV o XLSX.")


def parse_products(df: pd.DataFrame) -> tuple[list[ParsedProduct], list[RowError]]:
    columns = _column_map(df)
    products: list[ParsedProduct] = []
    errors: list[RowError] = []
    seen_skus: set[str] = set()

    for index, row in df.iterrows():
        row_number = int(index) + 2
        raw = row.to_dict()
        warnings: list[str] = []
        try:
            nombre = _clean_text(row[columns["nombre"]])
            sku = _clean_text(row[columns["sku"]])
            if not nombre:
                raise ValueError("Articulo vacio")
            if not sku:
                raise ValueError("codebarre vacio")

            cantidad = _parse_int(row[columns["cantidad"]], "cantidad")
            if cantidad < 0:
                warnings.append(f"cantidad negativa {cantidad}; se cargo como 0")
                cantidad = 0

            precio_venta_centavos = _parse_price_centavos(row[columns["precio_venta"]])
            if sku in seen_skus:
                warnings.append("codebarre duplicado; se sobrescribira el mismo documento")
            seen_skus.add(sku)
            products.append(
                ParsedProduct(
                    row_number=row_number,
                    nombre=nombre[:120],
                    cantidad=cantidad,
                    sku=sku[:80],
                    precio_venta_centavos=precio_venta_centavos,
                    warnings=warnings,
                )
            )
        except ValueError as exc:
            errors.append(RowError(row_number=row_number, reason=str(exc), raw=raw))

    return products, errors


def product_payload(product: ParsedProduct, source_file: Path) -> dict[str, Any]:
    now = firestore.SERVER_TIMESTAMP
    return {
        "nombre": product.nombre,
        "marca": None,
        "sku": product.sku,
        "categoria": "Inventario CSV",
        "cantidad": product.cantidad,
        "stockMinimo": DEFAULT_STOCK_MINIMO,
        "precioCompraCentavos": 0,
        "precioVentaCentavos": product.precio_venta_centavos,
        "estado": True,
        "createdAt": now,
        "updatedAt": now,
        "createdBy": "migration:productos-csv",
        "updatedBy": "migration:productos-csv",
        "migration": {
            "source": source_file.name,
            "rowNumber": product.row_number,
            "warnings": product.warnings,
        },
    }


def write_error_report(errors: list[RowError], products: list[ParsedProduct], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=["row_number", "level", "reason", "raw"])
        writer.writeheader()
        for error in errors:
            writer.writerow(
                {
                    "row_number": error.row_number,
                    "level": "error",
                    "reason": error.reason,
                    "raw": error.raw,
                }
            )
        for product in products:
            for warning in product.warnings:
                writer.writerow(
                    {
                        "row_number": product.row_number,
                        "level": "warning",
                        "reason": warning,
                        "raw": {"Articulo": product.nombre, "codebarre": product.sku},
                    }
                )


def upload_products(products: list[ParsedProduct], source_file: Path, dry_run: bool, limit: int | None) -> None:
    selected = products[:limit] if limit else products
    if dry_run:
        for product in selected[:10]:
            print(
                f"[dry-run] {_document_id(product.sku, product.row_number)} "
                f"{product.nombre} stock={product.cantidad} precio={product.precio_venta_centavos}"
            )
        if len(selected) > 10:
            print(f"[dry-run] ... {len(selected) - 10} productos mas")
        return

    db = get_firestore_client()
    batch = db.batch()
    pending = 0
    committed = 0

    for product in selected:
        doc_ref = db.collection("productos").document(_document_id(product.sku, product.row_number))
        batch.set(doc_ref, product_payload(product, source_file), merge=True)
        pending += 1
        committed += 1
        if pending >= MAX_BATCH_WRITES:
            batch.commit()
            print(f"Subidos {committed} productos...")
            batch = db.batch()
            pending = 0

    if pending:
        batch.commit()
    print(f"Carga completada: {committed} productos subidos a Firestore.")


def delete_existing_source_docs(source_file: Path) -> int:
    db = get_firestore_client()
    deleted = 0
    batch = db.batch()
    pending = 0
    snapshots = db.collection("productos").where("migration.source", "==", source_file.name).stream()
    for snapshot in snapshots:
        batch.delete(snapshot.reference)
        deleted += 1
        pending += 1
        if pending >= MAX_BATCH_WRITES:
            batch.commit()
            batch = db.batch()
            pending = 0
    if pending:
        batch.commit()
    return deleted


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Carga inventario CSV/XLSX de Audi Disc a Firestore.")
    parser.add_argument("--file", type=Path, default=None, help="Ruta al CSV/XLSX. Por defecto busca C:\\a\\productos.xlsx")
    parser.add_argument("--dry-run", action="store_true", help="Valida y muestra muestra sin escribir en Firestore.")
    parser.add_argument("--limit", type=int, default=None, help="Limita la cantidad de productos a cargar.")
    parser.add_argument(
        "--replace-source",
        action="store_true",
        help="Antes de cargar, elimina productos con migration.source igual al nombre del archivo.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT / "logs" / "load_inventory_csv_report.csv",
        help="Ruta del reporte de errores/advertencias.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = args.file or _default_input_path()
    if not input_path.exists():
        raise FileNotFoundError(f"No existe el archivo: {input_path}")

    df = read_products_file(input_path)
    products, errors = parse_products(df)
    write_error_report(errors, products, args.report)
    print(f"Archivo: {input_path}")
    print(f"Filas leidas: {len(df)}")
    print(f"Productos validos: {len(products)}")
    print(f"Filas rechazadas: {len(errors)}")
    print(f"Advertencias: {sum(len(product.warnings) for product in products)}")
    print(f"Reporte: {args.report}")
    if errors:
        print("Primeros errores:")
        for error in errors[:5]:
            print(f"  fila {error.row_number}: {error.reason}")

    if args.replace_source and not args.dry_run:
        deleted = delete_existing_source_docs(input_path)
        print(f"Documentos anteriores eliminados para {input_path.name}: {deleted}")

    upload_products(products, input_path, dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    main()
