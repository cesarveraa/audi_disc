from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.firebase import get_firestore_client  # noqa: E402
from rpa_uia_extractor import (  # noqa: E402
    DEFAULT_LOG_DIR,
    DEFAULT_STATE_DB,
    ExtractedSale,
    MigrationState,
    ProductLine,
    SaleHeader,
    build_doc_id,
    format_centavos,
    parse_money_centavos,
)


DEFAULT_SUMMARY = DEFAULT_LOG_DIR / "rpa_uia_extractor_summary_20260510_003411.json"
ADJUSTMENT_ARTICLE = "AJUSTE MIGRACION FILEMAKER"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    if not path.exists():
        return entries
    with path.open("r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"[WARN] JSONL invalido en {path}:{line_number}: {exc}")
                continue
            payload["_auditPath"] = str(path)
            entries.append(payload)
    return entries


def load_latest_held(summary_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    summary = read_json(summary_path)
    audit_path = Path(summary["auditPath"])
    held = [entry for entry in read_jsonl(audit_path) if entry.get("status") == "invalid_total"]
    return summary, held


def scan_candidate_attempts(log_dir: Path, held: list[dict[str, Any]], *, latest_only: bool) -> list[dict[str, Any]]:
    held_keys = {(str(entry.get("recordNumber")), str(entry.get("noComprobante"))) for entry in held}
    if latest_only:
        return held

    candidates: list[dict[str, Any]] = []
    for path in sorted(log_dir.glob("rpa_uia_extractor_*.jsonl")):
        for entry in read_jsonl(path):
            if entry.get("status") != "invalid_total":
                continue
            key = (str(entry.get("recordNumber")), str(entry.get("noComprobante")))
            if key in held_keys:
                candidates.append(entry)
    return candidates or held


def validation_score(entry: dict[str, Any]) -> tuple[int, int]:
    validation = entry.get("validation") or {}
    diff = int(validation.get("differenceCentavos") or 0)
    product_count = int(validation.get("productCount") or len(entry.get("productos") or []))
    return abs(diff), -product_count


def best_attempts(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for entry in candidates:
        key = (str(entry.get("recordNumber")), str(entry.get("noComprobante")))
        grouped.setdefault(key, []).append(entry)
    return [sorted(entries, key=validation_score)[0] for _, entries in sorted(grouped.items(), key=lambda item: int(item[0][0]))]


def product_from_payload(payload: dict[str, Any]) -> ProductLine:
    return ProductLine(
        articulo=str(payload["articulo"]),
        cantidad=int(payload["cantidad"]),
        precio_centavos=int(payload["precio_centavos"]),
        subtotal_centavos=int(payload["subtotal_centavos"]),
        precio_compra_centavos=payload.get("precio_compra_centavos"),
        utilidad_centavos=payload.get("utilidad_centavos"),
    )


def sale_from_entry(entry: dict[str, Any], products: list[ProductLine] | None = None) -> ExtractedSale:
    selected_products = products if products is not None else [product_from_payload(item) for item in entry.get("productos", [])]
    total_centavos = int(entry["totalCentavos"])
    items_total = sum(product.subtotal_centavos for product in selected_products)
    diff = items_total - total_centavos
    validation = {
        "valid": diff == 0,
        "itemsTotalCentavos": items_total,
        "headerTotalCentavos": total_centavos,
        "differenceCentavos": diff,
        "productCount": len(selected_products),
        "repaired": diff == 0,
    }
    header = SaleHeader(
        no_comprobante=str(entry["noComprobante"]),
        fecha_local=str(entry["fechaLocal"]),
        hora_local=str((entry.get("rawHeader") or {}).get("hora") or "00:00:00"),
        cliente=str(entry.get("cliente") or "Sin Nombre"),
        total_centavos=total_centavos,
        metodo=str((entry.get("rawHeader") or {}).get("metodo") or "Efectivo"),
        raw=entry.get("rawHeader") or {},
    )
    doc_id = build_doc_id(header, selected_products).replace("filemaker_uia_", "filemaker_uia_repaired_", 1)
    return ExtractedSale(
        record_number=int(entry["recordNumber"]),
        doc_id=doc_id,
        header=header,
        products=selected_products,
        validation=validation,
    )


def adjustment_line(missing_centavos: int) -> ProductLine:
    if missing_centavos <= 0:
        raise ValueError("El ajuste automatico solo soporta diferencias positivas pendientes.")
    return ProductLine(
        articulo=ADJUSTMENT_ARTICLE,
        cantidad=1,
        precio_centavos=missing_centavos,
        subtotal_centavos=missing_centavos,
        precio_compra_centavos=0,
        utilidad_centavos=missing_centavos,
    )


def add_adjustment(entry: dict[str, Any], *, reason: str) -> tuple[ExtractedSale, dict[str, Any]]:
    products = [product_from_payload(item) for item in entry.get("productos", [])]
    total_centavos = int(entry["totalCentavos"])
    items_total = sum(product.subtotal_centavos for product in products)
    missing = total_centavos - items_total
    if missing <= 0:
        raise ValueError(f"No hay monto positivo pendiente para ajustar: {missing}")
    products.append(adjustment_line(missing))
    sale = sale_from_entry(entry, products)
    repair = {
        "reason": reason,
        "adjustmentArticle": ADJUSTMENT_ARTICLE,
        "adjustmentCentavos": missing,
        "sourceDocId": entry.get("docId"),
        "sourceAuditPath": entry.get("_auditPath"),
        "sourceValidation": entry.get("validation"),
        "repairedAt": datetime.utcnow().isoformat() + "Z",
    }
    return sale, repair


def prompt_manual_repair(entry: dict[str, Any]) -> tuple[ExtractedSale | None, dict[str, Any] | None]:
    products = [product_from_payload(item) for item in entry.get("productos", [])]
    while True:
        sale = sale_from_entry(entry, products)
        print_sale("MANUAL", sale)
        if sale.valid:
            return sale, {
                "reason": "manual_product_edits",
                "sourceDocId": entry.get("docId"),
                "sourceAuditPath": entry.get("_auditPath"),
                "sourceValidation": entry.get("validation"),
                "repairedAt": datetime.utcnow().isoformat() + "Z",
            }

        missing = sale.header.total_centavos - sale.validation["itemsTotalCentavos"]
        print("Opciones: [a] agregar ajuste por diferencia, [p] agregar producto manual, [s] saltar")
        choice = input("> ").strip().lower()
        if choice == "s":
            return None, None
        if choice == "a":
            products.append(adjustment_line(missing))
            continue
        if choice == "p":
            name = input("Articulo: ").strip() or ADJUSTMENT_ARTICLE
            quantity_text = input("Cantidad [1]: ").strip() or "1"
            price_text = input(f"Precio Bs [{missing / 100:.2f}]: ").strip() or f"{missing / 100:.2f}"
            quantity = int(quantity_text)
            price = parse_money_centavos(price_text)
            if price is None or quantity <= 0:
                print("Entrada invalida; intenta otra vez.")
                continue
            products.append(
                ProductLine(
                    articulo=name,
                    cantidad=quantity,
                    precio_centavos=price,
                    subtotal_centavos=quantity * price,
                    precio_compra_centavos=0,
                    utilidad_centavos=quantity * price,
                )
            )
            continue
        print("Opcion no reconocida.")


def print_sale(status: str, sale: ExtractedSale) -> None:
    diff = int(sale.validation["differenceCentavos"])
    print(
        f"[{status}] Reg. {sale.record_number} | Comp. {sale.header.no_comprobante} | "
        f"{sale.header.fecha_local} | total={format_centavos(sale.header.total_centavos)} | "
        f"items={format_centavos(sale.validation['itemsTotalCentavos'])} | diff={format_centavos(diff)} | "
        f"items_count={len(sale.products)}"
    )


def upload_repaired_sale(db: Any, sale: ExtractedSale, repair: dict[str, Any], *, overwrite: bool) -> str:
    doc_ref = db.collection("ventas").document(sale.doc_id)
    if doc_ref.get().exists and not overwrite:
        return "skipped_existing"
    payload = sale.to_firestore()
    payload["legacy"]["method"] = "fix_held_sales"
    payload["legacy"]["repair"] = repair
    payload["legacy"]["validation"] = sale.validation
    payload["repaired"] = True
    doc_ref.set(payload, merge=overwrite)
    return "uploaded_repaired"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repara ventas retenidas por descuadre de la migracion UIA.")
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--interactive", action="store_true")
    parser.add_argument("--latest-only", action="store_true")
    parser.add_argument("--force-adjust-all", action="store_true")
    parser.add_argument("--auto-adjust-tolerance-centavos", type=int, default=150)
    parser.add_argument("--state-db", type=Path, default=DEFAULT_STATE_DB)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary_path = args.summary.resolve()
    summary, held = load_latest_held(summary_path)
    candidates = scan_candidate_attempts(summary_path.parent, held, latest_only=args.latest_only)
    selected = best_attempts(candidates)

    print("Resumen base:", json.dumps(summary, ensure_ascii=False))
    print("Comprobantes retenidos:", ", ".join(entry["noComprobante"] for entry in selected))
    print()

    db = get_firestore_client() if args.commit else None
    state = MigrationState(args.state_db.resolve())
    initial_cursor = state.last_record_number()
    uploaded = 0
    skipped = 0
    still_held = 0
    repairs: list[dict[str, Any]] = []

    for entry in selected:
        original_sale = sale_from_entry(entry)
        print_sale("HELD", original_sale)
        missing = original_sale.header.total_centavos - original_sale.validation["itemsTotalCentavos"]

        sale: ExtractedSale | None = None
        repair: dict[str, Any] | None = None
        if missing > 0 and abs(missing) <= args.auto_adjust_tolerance_centavos:
            sale, repair = add_adjustment(entry, reason="auto_tolerance")
        elif missing > 0 and args.force_adjust_all:
            sale, repair = add_adjustment(entry, reason="forced_operator_adjustment")
        elif args.interactive:
            sale, repair = prompt_manual_repair(entry)

        if sale is None or repair is None or not sale.valid:
            still_held += 1
            print("  -> Retenida; requiere correccion manual.")
            continue

        print_sale("REPAIRED", sale)
        repairs.append({"docId": sale.doc_id, "repair": repair, "sale": sale})
        if args.commit:
            assert db is not None
            status = upload_repaired_sale(db, sale, repair, overwrite=args.overwrite)
            if status == "uploaded_repaired":
                uploaded += 1
            else:
                skipped += 1
            state.mark_sale(
                doc_id=sale.doc_id,
                record_number=sale.record_number,
                no_comprobante=sale.header.no_comprobante,
                status="uploaded" if status in {"uploaded_repaired", "skipped_existing"} else status,
                total_centavos=sale.header.total_centavos,
            )
            print(f"  -> {status}: {sale.doc_id}")
        else:
            print("  -> DRY-RUN: no se subio a Firestore.")
        print()

    if args.commit:
        summary_cursor = int(summary.get("nextSuggestedRecord") or 1) - 1
        selected_cursor = max((int(entry["recordNumber"]) for entry in selected), default=0)
        state.mark_cursor(max(initial_cursor, summary_cursor, selected_cursor))

    result = {
        "heldFromLatestSummary": len(held),
        "selectedAttempts": len(selected),
        "repairedReady": len(repairs),
        "uploaded": uploaded,
        "skipped": skipped,
        "stillHeld": still_held,
        "commit": args.commit,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
