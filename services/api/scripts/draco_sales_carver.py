from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from recover_filemaker_draco_sales import (
    DEFAULT_RECOVER_LOG,
    FIELD_FOCUS,
    PAGE_SIZE,
    TARGET_ALIASES,
    TARGET_TABLES,
    encode_anchor_variants,
    extract_internal_dates,
    extract_numeric_amounts,
    extract_text_amounts,
    extract_text_dates,
    field_marker_patterns,
    find_anchor_hits,
    fmp2sqlite_status,
    integer_patterns,
    load_product_terms,
    parse_recover_log,
    printable_runs,
    product_anchor_terms,
    scan_zlib_blocks,
    unique_preserve_order,
    write_json,
)


AUDISC_DIR = Path(r"C:\a\Audisc2")
DEFAULT_INPUT = AUDISC_DIR / "kkkkk.fmp12"
DEFAULT_FALLBACK_INPUT = AUDISC_DIR / "FMbil_BDD Recovered.dll"
DEFAULT_PRODUCTS = AUDISC_DIR / "productos.xlsx"
DEFAULT_OUTPUT = AUDISC_DIR / "ventas_finales_recuperadas.json"
SERVICE_ROOT = Path(__file__).resolve().parents[1]

DRACO_FIELD_PREFIXES = (0x01, 0x02)
DRACO_DELIMITERS = {
    "field_id_01": b"\x01",
    "field_id_02": b"\x02",
    "text_or_token_20": b"\x20",
    "number_or_resource_28_80": b"\x28\x80",
    "repetition_07_07": b"\x07\x07",
    "page_link_zero_zero": b"\x00\x00",
}
TARGET_FIELD_NAMES = {
    "Temp_FacturaVenta": {"Fecha_Factura", "TotalFactura", "IdTemp_Facturas", "Nom_Cliente", "numventas"},
    "DetalleFactura": {"Articulo", "Cantidad", "PrecioUnitario", "Idtempfac", "numventas"},
}


@dataclass(frozen=True)
class DracoPageEvidence:
    page: int
    offset: int
    page_header_hex: str
    has_hbam: bool
    table_alias_hits: dict[str, int]
    table_library_hits: dict[str, int]
    field_hits: dict[str, list[dict[str, Any]]]
    delimiter_counts: dict[str, int]
    product_anchors: list[str]
    text_dates: list[str]
    internal_dates: list[str]
    text_amounts: list[str]
    numeric_amounts: list[float]
    snippets: list[str]
    score: int


@dataclass(frozen=True)
class RecoveredSale:
    id: str
    legacyVentaId: str | None
    fechaLocal: str
    horaLocal: str
    clienteNombre: str | None
    totalCentavos: int
    metodo: str
    productos: list[dict[str, Any]]
    estado: bool
    createdBy: str
    migrated: bool
    migratedFrom: str
    integrity: dict[str, Any]
    forensicEvidence: dict[str, Any]


def cents_from_decimal_text(value: str) -> int | None:
    normalized = value.strip().replace(" ", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    else:
        normalized = normalized.replace(",", ".")
    try:
        return int(round(float(normalized) * 100))
    except ValueError:
        return None


def get_fields_by_table(recover_schema: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    output: dict[str, list[dict[str, Any]]] = {}
    target_tables = recover_schema.get("targetTables", {})
    for table in TARGET_TABLES:
        focused_names = FIELD_FOCUS.get(table, set()) | TARGET_FIELD_NAMES.get(table, set())
        output[table] = [
            field
            for field in target_tables.get(table, {}).get("fields", [])
            if field.get("name") in focused_names
        ]
    return output


def count_pattern_after_header(page_data: bytes, pattern: bytes) -> int:
    if not pattern:
        return 0
    return page_data[32:].count(pattern)


def table_hits(page_data: bytes, recover_schema: dict[str, Any]) -> tuple[dict[str, int], dict[str, int]]:
    tables = recover_schema.get("tables", {})
    alias_hits: dict[str, int] = {}
    library_hits: dict[str, int] = {}
    for table in TARGET_TABLES:
        alias_id = TARGET_ALIASES.get(table)
        alias_hits[table] = sum(count_pattern_after_header(page_data, item) for item in integer_patterns(alias_id))
        library_id = tables.get(table)
        if isinstance(library_id, int):
            library_hits[table] = sum(count_pattern_after_header(page_data, item) for item in integer_patterns(library_id))
        else:
            library_hits[table] = 0
    return alias_hits, library_hits


def focused_field_hits(page_data: bytes, fields_by_table: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    hits: dict[str, list[dict[str, Any]]] = {}
    for table, fields in fields_by_table.items():
        table_hits_for_fields: list[dict[str, Any]] = []
        for field in fields:
            field_id = int(field["id"])
            count = sum(
                count_pattern_after_header(page_data, pattern)
                for pattern in field_marker_patterns(field_id)
            )
            if count:
                table_hits_for_fields.append({"id": field_id, "name": field["name"], "hits": count})
        hits[table] = table_hits_for_fields
    return hits


def delimiter_counts(page_data: bytes) -> dict[str, int]:
    body = page_data[32:]
    return {name: body.count(pattern) for name, pattern in DRACO_DELIMITERS.items()}


def score_evidence(evidence: DracoPageEvidence) -> int:
    table_score = sum(evidence.table_alias_hits.values()) * 12 + sum(evidence.table_library_hits.values()) * 3
    field_score = sum(min(field["hits"], 3) for fields in evidence.field_hits.values() for field in fields)
    business_score = (
        len(evidence.product_anchors) * 20
        + len(evidence.text_dates) * 10
        + len(evidence.internal_dates) * 3
        + len(evidence.text_amounts) * 4
        + min(len(evidence.numeric_amounts), 5)
    )
    delimiter_score = min(evidence.delimiter_counts.get("field_id_01", 0), 20) // 4
    return table_score + field_score + business_score + delimiter_score


def build_page_evidence(
    data: bytes,
    recover_schema: dict[str, Any],
    product_anchor_bytes: dict[str, list[bytes]],
    max_pages: int | None = None,
) -> list[DracoPageEvidence]:
    fields_by_table = get_fields_by_table(recover_schema)
    page_count = math.ceil(len(data) / PAGE_SIZE)
    if max_pages is not None:
        page_count = min(page_count, max_pages)

    evidences: list[DracoPageEvidence] = []
    for page in range(page_count):
        page_data = data[page * PAGE_SIZE : (page + 1) * PAGE_SIZE]
        snippets = printable_runs(page_data)
        alias_hits, library_hits = table_hits(page_data, recover_schema)
        field_hits = focused_field_hits(page_data, fields_by_table)
        delimiters = delimiter_counts(page_data)
        text_dates = extract_text_dates(snippets)
        text_amounts = extract_text_amounts(snippets)
        product_hits = find_anchor_hits(page_data, product_anchor_bytes, limit=8)

        preliminary = (
            bool(product_hits)
            or bool(text_dates)
            or bool(text_amounts)
            or any(alias_hits.values())
            or any(library_hits.values())
            or sum(len(items) for items in field_hits.values()) >= 4
        )
        if not preliminary:
            continue

        evidence = DracoPageEvidence(
            page=page,
            offset=page * PAGE_SIZE,
            page_header_hex=page_data[:32].hex(" "),
            has_hbam=b"HBAM" in page_data[:64],
            table_alias_hits=alias_hits,
            table_library_hits=library_hits,
            field_hits=field_hits,
            delimiter_counts=delimiters,
            product_anchors=product_hits,
            text_dates=text_dates,
            internal_dates=extract_internal_dates(page_data) if (text_dates or any(library_hits.values())) else [],
            text_amounts=text_amounts,
            numeric_amounts=extract_numeric_amounts(page_data) if (text_amounts or any(alias_hits.values())) else [],
            snippets=snippets[:12],
            score=0,
        )
        scored = DracoPageEvidence(**{**asdict(evidence), "score": score_evidence(evidence)})
        if scored.score >= 8 or scored.has_hbam:
            evidences.append(scored)

    return sorted(evidences, key=lambda item: item.score, reverse=True)


def identify_record_fragments(evidences: list[DracoPageEvidence]) -> dict[str, list[dict[str, Any]]]:
    header_fragments: list[dict[str, Any]] = []
    detail_fragments: list[dict[str, Any]] = []
    for evidence in evidences:
        temp_score = (
            evidence.table_alias_hits.get("Temp_FacturaVenta", 0) * 12
            + evidence.table_library_hits.get("Temp_FacturaVenta", 0) * 3
            + len(evidence.field_hits.get("Temp_FacturaVenta", []))
        )
        detalle_score = (
            evidence.table_alias_hits.get("DetalleFactura", 0) * 12
            + evidence.table_library_hits.get("DetalleFactura", 0) * 3
            + len(evidence.field_hits.get("DetalleFactura", []))
            + len(evidence.product_anchors) * 3
        )
        common = {
            "page": evidence.page,
            "offset": evidence.offset,
            "score": evidence.score,
            "snippets": evidence.snippets,
            "textDates": evidence.text_dates,
            "internalDates": evidence.internal_dates,
            "textAmounts": evidence.text_amounts,
            "numericAmounts": evidence.numeric_amounts,
            "productAnchors": evidence.product_anchors,
            "fieldHits": evidence.field_hits,
        }
        if temp_score >= 8 and (evidence.text_dates or evidence.internal_dates or evidence.text_amounts or evidence.numeric_amounts):
            header_fragments.append({**common, "tableScore": temp_score})
        if detalle_score >= 8 and (evidence.product_anchors or evidence.text_amounts or evidence.numeric_amounts):
            detail_fragments.append({**common, "tableScore": detalle_score})
    return {"headers": header_fragments[:120], "details": detail_fragments[:120]}


def reconstruct_sales(fragments: dict[str, list[dict[str, Any]]]) -> tuple[list[RecoveredSale], list[dict[str, Any]]]:
    valid_sales: list[RecoveredSale] = []
    rejected: list[dict[str, Any]] = []

    for header in fragments["headers"]:
        candidate_total = None
        for amount in header.get("textAmounts", []):
            candidate_total = cents_from_decimal_text(amount)
            if candidate_total:
                break
        if candidate_total is None and header.get("numericAmounts"):
            candidate_total = int(round(float(header["numericAmounts"][0]) * 100))

        fecha = None
        for raw_date in [*header.get("textDates", []), *header.get("internalDates", [])]:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
                fecha = raw_date
                break
            match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw_date)
            if match:
                month, day, year = match.groups()
                fecha = f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
                break

        nearby_details = [
            detail
            for detail in fragments["details"]
            if abs(int(detail["page"]) - int(header["page"])) <= 8
        ]
        items: list[dict[str, Any]] = []
        for detail in nearby_details:
            if not detail.get("productAnchors"):
                continue
            price = None
            for amount in detail.get("textAmounts", []):
                price = cents_from_decimal_text(amount)
                if price:
                    break
            if price is None and detail.get("numericAmounts"):
                price = int(round(float(detail["numericAmounts"][0]) * 100))
            if not price:
                continue
            item = {
                "productoId": f"legacy:{detail['productAnchors'][0]}",
                "nombre": detail["productAnchors"][0],
                "marca": None,
                "sku": None,
                "categoria": None,
                "cantidad": 1,
                "precioVentaCentavos": price,
                "precioVendidoCentavos": price,
                "subtotalCentavos": price,
            }
            items.append(item)

        item_sum = sum(int(item["subtotalCentavos"]) for item in items)
        if not fecha or not candidate_total or not items or item_sum != candidate_total:
            rejected.append(
                {
                    "reason": "integrity_failed_or_incomplete_draco_decode",
                    "headerPage": header["page"],
                    "fechaDetected": fecha,
                    "totalCentavosDetected": candidate_total,
                    "itemsDetected": len(items),
                    "itemsTotalCentavos": item_sum,
                    "nearbyDetailPages": [detail["page"] for detail in nearby_details[:12]],
                }
            )
            continue

        legacy_hash = hashlib.sha1(json.dumps(header, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]
        valid_sales.append(
            RecoveredSale(
                id=f"legacy_filemaker_{legacy_hash}",
                legacyVentaId=None,
                fechaLocal=fecha,
                horaLocal="00:00:00",
                clienteNombre=None,
                totalCentavos=candidate_total,
                metodo="Efectivo",
                productos=items,
                estado=True,
                createdBy="legacy-filemaker-carver",
                migrated=True,
                migratedFrom="FileMaker12-DracoPageCarving",
                integrity={
                    "itemsTotalCentavos": item_sum,
                    "totalCentavos": candidate_total,
                    "valid": True,
                },
                forensicEvidence={
                    "headerPage": header["page"],
                    "detailPages": [detail["page"] for detail in nearby_details],
                },
            )
        )

    return valid_sales, rejected


def commit_sales_to_firestore(sales: list[RecoveredSale]) -> dict[str, Any]:
    if not sales:
        return {"requested": True, "uploaded": 0, "skippedReason": "No validated sales to upload."}

    if str(SERVICE_ROOT) not in sys.path:
        sys.path.insert(0, str(SERVICE_ROOT))

    from app.core.firebase import get_firestore_client

    db = get_firestore_client()
    batch = db.batch()
    uploaded = 0
    for sale in sales:
        doc_ref = db.collection("ventas").document(sale.id)
        payload = asdict(sale)
        payload["createdAt"] = datetime.utcnow().isoformat() + "Z"
        payload["legacySource"] = {
            "system": "FileMaker Pro 12",
            "method": "Draco page carving",
        }
        batch.set(doc_ref, payload, merge=False)
        uploaded += 1
        if uploaded % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    return {"requested": True, "uploaded": uploaded, "skippedReason": None}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recover FileMaker 12 sales through Draco page carving.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--fallback-input", type=Path, default=DEFAULT_FALLBACK_INPUT)
    parser.add_argument("--recover-log", type=Path, default=DEFAULT_RECOVER_LOG)
    parser.add_argument("--products", type=Path, default=DEFAULT_PRODUCTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--commit", action="store_true", help="Upload validated sales to Firestore.")
    parser.add_argument("--max-pages", type=int, default=None)
    return parser.parse_args()


def choose_input(primary: Path, fallback: Path) -> Path:
    if primary.exists():
        return primary.resolve()
    if fallback.exists():
        return fallback.resolve()
    raise FileNotFoundError(f"No existe {primary} ni {fallback}")


def main() -> None:
    args = parse_args()
    input_path = choose_input(args.input, args.fallback_input)
    data = input_path.read_bytes()
    recover_schema = parse_recover_log(args.recover_log.resolve())
    products = load_product_terms(args.products.resolve())
    anchors = product_anchor_terms(products)
    anchor_bytes = encode_anchor_variants(anchors)

    evidences = build_page_evidence(data, recover_schema, anchor_bytes, max_pages=args.max_pages)
    fragments = identify_record_fragments(evidences)
    valid_sales, rejected = reconstruct_sales(fragments)
    zlib_findings = scan_zlib_blocks(data, anchor_bytes)

    firestore_result = {"requested": args.commit, "uploaded": 0, "skippedReason": "Commit flag not provided."}
    if args.commit:
        firestore_result = commit_sales_to_firestore(valid_sales)

    hbam_pages = [
        page
        for page in range(math.ceil(len(data) / PAGE_SIZE))
        if b"HBAM" in data[page * PAGE_SIZE : page * PAGE_SIZE + 64]
    ]
    delimiter_totals = Counter()
    for evidence in evidences:
        delimiter_totals.update(evidence.delimiter_counts)

    output = {
        "status": "validated_sales_recovered" if valid_sales else "no_validated_sales_recovered",
        "sourceFile": str(input_path),
        "sha256": hashlib.sha256(data).hexdigest(),
        "fileSizeBytes": len(data),
        "pageSize": PAGE_SIZE,
        "pageCount": math.ceil(len(data) / PAGE_SIZE),
        "hbamPages": hbam_pages,
        "header": {
            "first64Hex": data[:64].hex(" "),
            "looksLikeFileMakerContainer": b"HBAM" in data[:1024],
            "looksLikeWindowsDll": data[:2] == b"MZ",
        },
        "recoverLog": {
            "path": str(args.recover_log.resolve()),
            "targetTables": recover_schema.get("targetTables", {}),
        },
        "dracoCarving": {
            "candidatePages": len(evidences),
            "delimiterTotals": dict(delimiter_totals),
            "recordFragments": {
                "headers": len(fragments["headers"]),
                "details": len(fragments["details"]),
            },
            "topPages": [asdict(evidence) for evidence in evidences[:120]],
            "fragments": fragments,
        },
        "zlib": {
            "blocksFound": len(zlib_findings),
            "blocksWithSchemaOrProducts": [
                asdict(item)
                for item in zlib_findings
                if item.product_anchors or item.schema_terms or item.dates or item.amounts
            ][:40],
            "firstBlocks": [asdict(item) for item in zlib_findings[:20]],
        },
        "validation": {
            "validSales": len(valid_sales),
            "rejectedCandidates": len(rejected),
            "rule": "Firestore upload requires fecha + total + detail items and sum(items.subtotalCentavos) == totalCentavos.",
            "rejectionsSample": rejected[:80],
        },
        "ventas": [asdict(sale) for sale in valid_sales],
        "firestore": firestore_result,
        "fmp2sqlite": fmp2sqlite_status(),
        "notes": [
            "Direct field names and product names are not present as plaintext in this FileMaker container.",
            "HBAM appears in the file header; subsequent 4096-byte pages use binary page headers, not repeated HBAM signatures.",
            "The script intentionally refuses to fabricate sales from partial Draco fragments.",
            "If this returns zero validated sales, export through FileMaker/fmp2sqlite/ODBC is the safe path for full historical migration.",
        ],
    }
    write_json(args.output.resolve(), output)

    print(
        json.dumps(
            {
                "status": output["status"],
                "output": str(args.output.resolve()),
                "sourceFile": str(input_path),
                "validSales": len(valid_sales),
                "candidatePages": len(evidences),
                "headerFragments": len(fragments["headers"]),
                "detailFragments": len(fragments["details"]),
                "zlibBlocks": len(zlib_findings),
                "firestore": firestore_result,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
