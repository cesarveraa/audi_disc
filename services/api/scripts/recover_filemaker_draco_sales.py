from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import struct
import zlib
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


AUDISC_DIR = Path(r"C:\a\Audisc2")
DEFAULT_INPUT = AUDISC_DIR / "FMbil_BDD Recovered.dll"
DEFAULT_PRODUCTS = AUDISC_DIR / "productos.xlsx"
DEFAULT_RECOVER_LOG = AUDISC_DIR / "Recover.log"
DEFAULT_OUTPUT = AUDISC_DIR / "ventas_recuperadas_directas.json"
DEFAULT_CARVED = AUDISC_DIR / "draco_candidate_pages.bin"
DEFAULT_MANIFEST = AUDISC_DIR / "draco_candidate_pages_manifest.jsonl"

PAGE_SIZE = 4096
HEADER_SKIP_BYTES = 32
MAX_CONTEXT_SNIPPETS = 12
MAX_CANDIDATE_PAGES = 250

TARGET_TABLES = ("Temp_FacturaVenta", "DetalleFactura", "Libro_Venta_mes")
TARGET_ALIASES = {
    "Temp_FacturaVenta": 1065094,
    "DetalleFactura": 1065095,
    "Libro_Venta_mes": 1065098,
}
FIELD_FOCUS = {
    "Temp_FacturaVenta": {
        "Fecha_Factura",
        "FechaCreacionFactura",
        "TotalFactura",
        "TotalFacturaTxt",
        "IdTemp_Facturas",
        "Nom_Cliente",
        "numventas",
        "Pago",
        "Vuelto",
        "TotalGeneral",
        "Utilidad",
        "Utilidad_Final",
    },
    "DetalleFactura": {
        "Articulo",
        "Cantidad",
        "PrecioUnitario",
        "SubtotalConDescto",
        "PrecioCompra",
        "idprod",
        "IdDetalleFact",
        "Idtempfac",
        "utilidad",
        "Subtotal_utilidad",
        "numventas",
        "SubtotalReal",
        "codbarre",
    },
    "Libro_Venta_mes": {
        "FechaCprobte",
        "NumNITCliente",
        "RazonSocialCliente",
        "NumCprobte",
        "CodigoControl",
        "TotalGeneral",
        "Importe Neto",
        "debito Fiscal",
        "numventas",
        "Tipo_venta",
        "Encargado_venta",
        "pago",
        "Vuelto",
        "Utilidad",
        "total Utilidad",
    },
}

PRODUCT_SEED_ANCHORS = ("EWTTO", "WAHL", "GENIUS")
NOISE_STRINGS = {
    "adobe",
    "photoshop",
    "xmp",
    "png",
    "tiff",
    "icc",
    "display",
    "profile",
    "microsoft",
}
GENERIC_PRODUCT_TOKENS = {
    "PACK",
    "CONT",
    "MINI",
    "COLOR",
    "CONTROL",
    "BLACK",
    "FILL",
    "PORT",
    "LAYER",
    "RADIO",
    "PRINT",
    "BARRA",
    "JUEGO",
    "SIMPLE",
    "LINK",
    "AUTO",
    "AUDIO",
    "DISPLAY",
    "IMAGEN",
    "PARA",
    "CON",
    "PZA",
    "PZS",
    "PARES",
    "GENERICO",
    "GENERICA",
    "UNIVERSAL",
    "LIGHT",
    "GOOGLE",
    "EXTERNO",
    "EXTERNA",
    "CUADRADO",
}


@dataclass(frozen=True)
class FieldInfo:
    table: str
    name: str
    field_id: int


@dataclass(frozen=True)
class PageCandidate:
    page: int
    offset: int
    reason: str
    score: int
    table_scores: dict[str, int]
    table_id_hits: dict[str, int]
    alias_hits: dict[str, int]
    focused_field_hits: dict[str, list[int]]
    product_anchors: list[str]
    text_dates: list[str]
    internal_dates: list[str]
    text_amounts: list[str]
    numeric_amounts: list[float]
    snippets: list[str]
    header_hex: str


@dataclass(frozen=True)
class ZlibFinding:
    offset: int
    page: int
    signature: str
    decompressed_bytes: int
    eof: bool
    printable_ratio: float
    product_anchors: list[str]
    schema_terms: list[str]
    dates: list[str]
    amounts: list[str]
    snippets: list[str]


def unique_preserve_order(values: Iterable[Any]) -> list[Any]:
    seen: set[Any] = set()
    output: list[Any] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_recover_log(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False, "tables": {}, "fieldsByTable": {}}

    text = path.read_text(encoding="utf-8", errors="replace")
    table_re = re.compile(r"Recovering: table '([^']+)' \((\d+)\)")
    fields_for_table_re = re.compile(r"Recovering fields for table '([^']+)'")
    indexes_for_table_re = re.compile(r"Recovering indexes for table '([^']+)'")
    field_re = re.compile(r"Recovering: field '([^']+)' \((\d+)\)")
    index_re = re.compile(
        r"Rebuilt (?:value|word) index for field '([^']+)'; ([0-9,]+) item\(s\)"
    )

    tables: dict[str, int] = {}
    fields_by_table: dict[str, list[dict[str, Any]]] = {}
    index_counts: dict[str, list[dict[str, Any]]] = {}
    current_table = ""
    current_index_table = ""

    for line in text.splitlines():
        table_match = table_re.search(line)
        if table_match:
            tables.setdefault(table_match.group(1), int(table_match.group(2)))
            continue

        fields_table_match = fields_for_table_re.search(line)
        if fields_table_match:
            current_table = fields_table_match.group(1)
            fields_by_table.setdefault(current_table, [])
            continue

        indexes_table_match = indexes_for_table_re.search(line)
        if indexes_table_match:
            current_index_table = indexes_table_match.group(1)
            index_counts.setdefault(current_index_table, [])
            continue

        field_match = field_re.search(line)
        if field_match and current_table:
            field_name = field_match.group(1)
            field_id = int(field_match.group(2))
            rows = fields_by_table.setdefault(current_table, [])
            if not any(row["id"] == field_id and row["name"] == field_name for row in rows):
                rows.append({"id": field_id, "name": field_name})
            continue

        index_match = index_re.search(line)
        if index_match and current_index_table:
            row = {
                "field": index_match.group(1),
                "items": int(index_match.group(2).replace(",", "")),
            }
            rows = index_counts.setdefault(current_index_table, [])
            if row not in rows:
                rows.append(row)

    return {
        "path": str(path),
        "exists": True,
        "tables": tables,
        "fieldsByTable": fields_by_table,
        "indexCounts": index_counts,
        "targetTables": {
            table: {
                "libraryId": tables.get(table),
                "fields": fields_by_table.get(table, []),
                "focusedFields": [
                    field
                    for field in fields_by_table.get(table, [])
                    if field["name"] in FIELD_FOCUS.get(table, set())
                ],
                "indexes": index_counts.get(table, []),
            }
            for table in TARGET_TABLES
        },
    }


def load_product_terms(path: Path, max_terms: int = 2500) -> list[str]:
    if not path.exists():
        return []

    if path.suffix.lower() in {".xlsx", ".xls"}:
        frame = pd.read_excel(path)
    else:
        frame = pd.read_csv(path)

    column_by_lower = {str(column).strip().lower(): column for column in frame.columns}
    article_column = column_by_lower.get("articulo")
    if article_column is None:
        object_columns = [column for column in frame.columns if frame[column].dtype == object]
        article_column = object_columns[0] if object_columns else frame.columns[0]

    values: list[str] = []
    for raw_value in frame[article_column].dropna().astype(str):
        value = re.sub(r"\s+", " ", raw_value).strip()
        if len(value) >= 4:
            values.append(value)
    values.sort(key=len, reverse=True)
    return unique_preserve_order(values)[:max_terms]


def product_anchor_terms(product_terms: list[str]) -> list[str]:
    anchors: list[str] = []
    for seed in PRODUCT_SEED_ANCHORS:
        anchors.append(seed)
        anchors.extend(term for term in product_terms if seed.lower() in term.lower())

    token_counter: Counter[str] = Counter()
    for term in product_terms:
        for token in re.findall(r"[A-Za-z0-9][-A-Za-z0-9/]{3,}", term.upper()):
            if (
                len(token) >= 5
                and token.lower() not in NOISE_STRINGS
                and token not in GENERIC_PRODUCT_TOKENS
            ):
                token_counter[token] += 1
    anchors.extend(
        token
        for token, count in token_counter.most_common(180)
        if count <= 25 or any(seed in token for seed in PRODUCT_SEED_ANCHORS)
    )
    anchors.extend(product_terms[:160])
    return unique_preserve_order(anchors)


def encode_anchor_variants(anchors: Iterable[str]) -> dict[str, list[bytes]]:
    variants: dict[str, list[bytes]] = {}
    for anchor in anchors:
        normalized = re.sub(r"\s+", " ", anchor).strip()
        if len(normalized) < 4:
            continue
        candidates = {normalized, normalized.upper(), normalized.lower()}
        encoded: list[bytes] = []
        for candidate in candidates:
            for encoding in ("utf-8", "cp1252", "latin-1", "utf-16-le", "utf-16-be"):
                try:
                    encoded.append(candidate.encode(encoding))
                except UnicodeEncodeError:
                    continue
        variants[normalized] = unique_preserve_order(encoded)
    return variants


def find_anchor_hits(data: bytes, anchor_bytes: dict[str, list[bytes]], limit: int = 12) -> list[str]:
    hits: list[str] = []
    upper_data = data.upper()
    for anchor, variants in anchor_bytes.items():
        found = False
        for variant in variants:
            if len(variant) < 4:
                continue
            haystack = upper_data if all(32 <= byte <= 126 for byte in variant) else data
            needle = variant.upper() if haystack is upper_data else variant
            if needle in haystack:
                found = True
                break
        if found:
            hits.append(anchor)
            if len(hits) >= limit:
                break
    return hits


def printable_runs(data: bytes, min_length: int = 5) -> list[str]:
    ascii_runs = [
        match.group(0).decode("cp1252", errors="replace")
        for match in re.finditer(rb"[\x20-\x7e\xa0-\xff]{%d,}" % min_length, data)
    ]
    utf16_runs: list[str] = []
    for encoding in ("utf-16-le", "utf-16-be"):
        try:
            decoded = data.decode(encoding, errors="ignore")
        except UnicodeDecodeError:
            continue
        utf16_runs.extend(re.findall(r"[ -~A-Za-z0-9ÁÉÍÓÚÑáéíóúñ.,:/\\-]{%d,}" % min_length, decoded))

    snippets: list[str] = []
    for raw in [*ascii_runs, *utf16_runs]:
        text = re.sub(r"\s+", " ", raw).strip()
        if not text:
            continue
        lowered = text.lower()
        if any(noise in lowered for noise in NOISE_STRINGS):
            continue
        if len(text) > 180:
            text = text[:180]
        snippets.append(text)
    return unique_preserve_order(snippets)


def extract_text_dates(snippets: Iterable[str]) -> list[str]:
    dates: list[str] = []
    date_re = re.compile(
        r"\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b"
    )
    for snippet in snippets:
        dates.extend(date_re.findall(snippet))
    return unique_preserve_order(dates)[:20]


def extract_text_amounts(snippets: Iterable[str]) -> list[str]:
    amounts: list[str] = []
    amount_re = re.compile(r"(?<![A-Za-z0-9])\d{1,6}(?:[.,]\d{2})(?![A-Za-z0-9])")
    for snippet in snippets:
        amounts.extend(amount_re.findall(snippet))
    return unique_preserve_order(amounts)[:30]


def extract_internal_dates(data: bytes, limit: int = 20) -> list[str]:
    # FileMaker dates are commonly stored as day ordinals from 0001-01-01.
    earliest = date(2020, 1, 1).toordinal()
    latest = date(2027, 12, 31).toordinal()
    found: list[str] = []
    for offset in range(0, max(0, len(data) - 4)):
        chunk = data[offset : offset + 4]
        for endian in (">I", "<I"):
            value = struct.unpack(endian, chunk)[0]
            if earliest <= value <= latest:
                try:
                    found.append(date.fromordinal(value).isoformat())
                except ValueError:
                    continue
                if len(set(found)) >= limit:
                    return unique_preserve_order(found)[:limit]
    return unique_preserve_order(found)[:limit]


def extract_numeric_amounts(data: bytes, limit: int = 20) -> list[float]:
    values: list[float] = []
    for offset in range(0, max(0, len(data) - 8), 2):
        chunk = data[offset : offset + 8]
        for endian in (">d", "<d"):
            try:
                value = struct.unpack(endian, chunk)[0]
            except struct.error:
                continue
            if math.isfinite(value) and 0.01 <= value <= 500_000 and round(value, 2) == value:
                if value not in values:
                    values.append(value)
                if len(values) >= limit:
                    return values
    return values


def integer_patterns(value: int) -> list[bytes]:
    patterns: list[bytes] = []
    if 0 <= value <= 0xFFFF:
        patterns.extend([value.to_bytes(2, "big"), value.to_bytes(2, "little")])
    if 0 <= value <= 0xFFFFFFFF:
        patterns.extend([value.to_bytes(4, "big"), value.to_bytes(4, "little")])
    return unique_preserve_order(patterns)


def field_marker_patterns(field_id: int) -> list[bytes]:
    patterns: list[bytes] = []
    if 0 <= field_id <= 0xFF:
        for prefix in (0x01, 0x02):
            patterns.append(bytes([prefix, field_id]))
    if 0 <= field_id <= 0xFFFF:
        for prefix in (0x01, 0x02):
            patterns.append(bytes([prefix]) + field_id.to_bytes(2, "big"))
            patterns.append(bytes([prefix]) + field_id.to_bytes(2, "little"))
    return unique_preserve_order(patterns)


def count_outside_header(data: bytes, pattern: bytes) -> int:
    if not pattern:
        return 0
    return data[HEADER_SKIP_BYTES:].count(pattern)


def focused_fields(recover_schema: dict[str, Any]) -> dict[str, list[FieldInfo]]:
    focused: dict[str, list[FieldInfo]] = {}
    target_schema = recover_schema.get("targetTables", {})
    for table in TARGET_TABLES:
        rows = target_schema.get(table, {}).get("focusedFields", [])
        focused[table] = [
            FieldInfo(table=table, name=row["name"], field_id=int(row["id"]))
            for row in rows
            if isinstance(row.get("id"), int)
        ]
    return focused


def score_page(
    page_data: bytes,
    page_index: int,
    recover_schema: dict[str, Any],
    focus_by_table: dict[str, list[FieldInfo]],
    anchor_bytes: dict[str, list[bytes]],
) -> PageCandidate | None:
    snippets = printable_runs(page_data)
    product_hits = find_anchor_hits(page_data, anchor_bytes)
    text_dates = extract_text_dates(snippets)
    text_amounts = extract_text_amounts(snippets)

    table_scores: dict[str, int] = {}
    table_id_hits: dict[str, int] = {}
    alias_hits: dict[str, int] = {}
    focused_field_hits: dict[str, list[int]] = {}
    tables = recover_schema.get("tables", {})

    for table in TARGET_TABLES:
        library_id = tables.get(table)
        raw_table_hits = 0
        if isinstance(library_id, int):
            raw_table_hits = sum(count_outside_header(page_data, pattern) for pattern in integer_patterns(library_id))
        alias_id = TARGET_ALIASES.get(table)
        raw_alias_hits = sum(count_outside_header(page_data, pattern) for pattern in integer_patterns(alias_id))
        table_id_hits[table] = raw_table_hits
        alias_hits[table] = raw_alias_hits

        fields_found: list[int] = []
        marker_hits = 0
        for field in focus_by_table.get(table, []):
            count = sum(count_outside_header(page_data, pattern) for pattern in field_marker_patterns(field.field_id))
            if count:
                fields_found.append(field.field_id)
                marker_hits += min(count, 3)
        focused_field_hits[table] = fields_found

        table_scores[table] = raw_alias_hits * 8 + raw_table_hits * 3 + marker_hits

    internal_dates: list[str] = []
    numeric_amounts: list[float] = []
    best_table = max(table_scores, key=table_scores.get)
    score = table_scores[best_table] + len(product_hits) * 10 + len(text_dates) * 5 + len(text_amounts)
    if score >= 10 or product_hits or text_dates:
        internal_dates = extract_internal_dates(page_data)
        numeric_amounts = extract_numeric_amounts(page_data)
        if internal_dates:
            score += 4
        if numeric_amounts:
            score += 2

    if score < 10 and not product_hits:
        return None

    reason_parts: list[str] = []
    if product_hits:
        reason_parts.append("product_anchor")
    if text_dates or internal_dates:
        reason_parts.append("date_candidate")
    if text_amounts or numeric_amounts:
        reason_parts.append("amount_candidate")
    if alias_hits.get(best_table):
        reason_parts.append("target_alias_id")
    if table_id_hits.get(best_table):
        reason_parts.append("target_library_id")
    if focused_field_hits.get(best_table):
        reason_parts.append("focused_field_markers")

    return PageCandidate(
        page=page_index,
        offset=page_index * PAGE_SIZE,
        reason="+".join(reason_parts) or "binary_score",
        score=score,
        table_scores=table_scores,
        table_id_hits=table_id_hits,
        alias_hits=alias_hits,
        focused_field_hits=focused_field_hits,
        product_anchors=product_hits,
        text_dates=text_dates,
        internal_dates=internal_dates,
        text_amounts=text_amounts,
        numeric_amounts=numeric_amounts,
        snippets=snippets[:MAX_CONTEXT_SNIPPETS],
        header_hex=page_data[:32].hex(" "),
    )


def scan_zlib_blocks(data: bytes, anchor_bytes: dict[str, list[bytes]]) -> list[ZlibFinding]:
    findings: list[ZlibFinding] = []
    for match in re.finditer(rb"\x78(?:\x01|\x5e|\x9c|\xda)", data):
        offset = match.start()
        decompressor = zlib.decompressobj()
        try:
            payload = decompressor.decompress(data[offset : offset + 2_000_000], 2_000_000)
        except zlib.error:
            continue
        if len(payload) < 64:
            continue

        snippets = printable_runs(payload)
        product_hits = find_anchor_hits(payload, anchor_bytes)
        schema_hits = [
            term
            for term in (
                "Temp_FacturaVenta",
                "DetalleFactura",
                "Libro_Venta_mes",
                "TotalFactura",
                "Articulo",
                "PrecioUnitario",
                "numventas",
            )
            if term.encode("utf-8") in payload or term.encode("utf-16-le") in payload
        ]
        printable = sum(1 for byte in payload if byte in b"\r\n\t" or 32 <= byte <= 126)
        ratio = printable / max(1, len(payload))
        finding = ZlibFinding(
            offset=offset,
            page=offset // PAGE_SIZE,
            signature=data[offset : offset + 2].hex(" "),
            decompressed_bytes=len(payload),
            eof=decompressor.eof,
            printable_ratio=round(ratio, 4),
            product_anchors=product_hits,
            schema_terms=schema_hits,
            dates=extract_text_dates(snippets),
            amounts=extract_text_amounts(snippets),
            snippets=snippets[:MAX_CONTEXT_SNIPPETS],
        )
        findings.append(finding)
    return findings


def probable_records_from_candidates(candidates: list[PageCandidate]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    by_page = {candidate.page: candidate for candidate in candidates}

    for candidate in candidates:
        has_header_shape = (
            candidate.table_scores.get("Temp_FacturaVenta", 0) >= 12
            or candidate.table_scores.get("Libro_Venta_mes", 0) >= 12
        )
        has_detail_shape = candidate.table_scores.get("DetalleFactura", 0) >= 12
        has_business_values = bool(
            candidate.product_anchors
            or candidate.text_dates
            or candidate.internal_dates
            or candidate.text_amounts
        )
        if not has_business_values or not (has_header_shape or has_detail_shape):
            continue

        nearby_details = [
            asdict(by_page[page])
            for page in range(candidate.page - 2, candidate.page + 3)
            if page in by_page and by_page[page].table_scores.get("DetalleFactura", 0) >= 12
        ]
        confidence = "low"
        if candidate.product_anchors and (candidate.text_dates or candidate.internal_dates):
            confidence = "medium"
        if candidate.product_anchors and candidate.text_dates and candidate.text_amounts:
            confidence = "high"

        if confidence == "low":
            continue

        records.append(
            {
                "confidence": confidence,
                "sourcePage": candidate.page,
                "sourceOffset": candidate.offset,
                "ventaId": None,
                "fechaLocal": (candidate.text_dates or candidate.internal_dates or [None])[0],
                "nombreCliente": None,
                "totalCentavos": None,
                "items": [],
                "evidence": {
                    "candidate": asdict(candidate),
                    "nearbyDetalleCandidates": nearby_details[:5],
                },
            }
        )
    return records


def write_carved_pages(
    output: Path,
    manifest_output: Path,
    data: bytes,
    candidates: list[PageCandidate],
    zlib_findings: list[ZlibFinding],
) -> dict[str, Any]:
    selected_pages = sorted(
        {
            candidate.page
            for candidate in candidates
            if candidate.score >= 18 or candidate.product_anchors or any(candidate.alias_hits.values())
        }
        | {finding.page for finding in zlib_findings if finding.product_anchors or finding.schema_terms}
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest_output.parent.mkdir(parents=True, exist_ok=True)

    with output.open("wb") as carved, manifest_output.open("w", encoding="utf-8") as manifest:
        for page in selected_pages:
            offset = page * PAGE_SIZE
            page_data = data[offset : offset + PAGE_SIZE]
            carved.write(page_data)
            related_candidates = [asdict(candidate) for candidate in candidates if candidate.page == page]
            related_zlib = [asdict(finding) for finding in zlib_findings if finding.page == page]
            manifest.write(
                json.dumps(
                    {
                        "page": page,
                        "sourceOffset": offset,
                        "carvedOffset": (selected_pages.index(page)) * PAGE_SIZE,
                        "candidateCount": len(related_candidates),
                        "zlibFindingCount": len(related_zlib),
                        "candidates": related_candidates,
                        "zlibFindings": related_zlib,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    return {
        "path": str(output),
        "manifestPath": str(manifest_output),
        "pagesWritten": len(selected_pages),
        "bytesWritten": len(selected_pages) * PAGE_SIZE,
        "note": "Forensic carving only; this is not a valid compacted FileMaker copy.",
    }


def fmp2sqlite_status() -> dict[str, Any]:
    executable = shutil.which("fmp2sqlite")
    commands = [
        'fmp2sqlite "C:\\a\\Audisc2\\kkkkk.fmp12" "C:\\a\\Audisc2\\audisc.sqlite"',
        'fmp2sqlite "C:\\a\\Audisc2\\FMbil_BDD Recovered.dll" "C:\\a\\Audisc2\\audisc_recovered.sqlite"',
    ]
    return {
        "availableInPath": bool(executable),
        "path": executable,
        "suggestedCommands": commands,
        "note": "Use the kkkkk.fmp12 sibling first if FileMaker opens it; it has the same HBAM7 header and normal extension.",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Forensic FileMaker 12/Draco sales recovery by binary page carving."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--products", type=Path, default=DEFAULT_PRODUCTS)
    parser.add_argument("--recover-log", type=Path, default=DEFAULT_RECOVER_LOG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--carved-output", type=Path, default=DEFAULT_CARVED)
    parser.add_argument("--manifest-output", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--max-product-terms", type=int, default=2500)
    parser.add_argument("--max-candidates", type=int, default=MAX_CANDIDATE_PAGES)
    parser.add_argument("--skip-carve", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = args.input.resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Binary file not found: {input_path}")

    data = input_path.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    recover_schema = parse_recover_log(args.recover_log.resolve())
    product_terms = load_product_terms(args.products.resolve(), args.max_product_terms)
    anchors = product_anchor_terms(product_terms)
    anchor_bytes = encode_anchor_variants(anchors)
    focus_by_table = focused_fields(recover_schema)

    page_count = math.ceil(len(data) / PAGE_SIZE)
    candidates: list[PageCandidate] = []
    for page_index in range(page_count):
        page_data = data[page_index * PAGE_SIZE : (page_index + 1) * PAGE_SIZE]
        candidate = score_page(page_data, page_index, recover_schema, focus_by_table, anchor_bytes)
        if candidate is not None:
            candidates.append(candidate)

    candidates.sort(
        key=lambda item: (
            bool(item.product_anchors),
            any(item.alias_hits.values()),
            bool(item.text_dates or item.internal_dates),
            item.score,
        ),
        reverse=True,
    )

    zlib_findings = scan_zlib_blocks(data, anchor_bytes)
    zlib_findings.sort(
        key=lambda item: (
            bool(item.product_anchors),
            bool(item.schema_terms),
            bool(item.dates or item.amounts),
            item.printable_ratio,
            item.decompressed_bytes,
        ),
        reverse=True,
    )

    records = probable_records_from_candidates(candidates)
    status = "records_reconstructed" if records else "no_complete_records_reconstructed"
    carved_report: dict[str, Any] | None = None
    if not args.skip_carve:
        carved_report = write_carved_pages(
            args.carved_output.resolve(),
            args.manifest_output.resolve(),
            data,
            candidates,
            zlib_findings,
        )

    output_payload = {
        "status": status,
        "sourceFile": str(input_path),
        "sha256": sha256,
        "fileSizeBytes": len(data),
        "pageSize": PAGE_SIZE,
        "pageCount": page_count,
        "header": {
            "first64Hex": data[:64].hex(" "),
            "containerSignature": data[14:20].decode("latin-1", errors="replace"),
            "looksLikeWindowsDll": data[:2] == b"MZ",
            "looksLikeFileMakerContainer": b"HBAM7" in data[:64],
        },
        "recoverLog": recover_schema,
        "products": {
            "path": str(args.products.resolve()),
            "termsLoaded": len(product_terms),
            "anchorsUsed": anchors[:80],
        },
        "recordsFound": len(records),
        "records": records,
        "candidatePagesFound": len(candidates),
        "candidatePages": [asdict(candidate) for candidate in candidates[: args.max_candidates]],
        "zlibBlocksFound": len(zlib_findings),
        "zlibBlocks": [asdict(finding) for finding in zlib_findings[:120]],
        "carvedCandidatePages": carved_report,
        "fmp2sqlite": fmp2sqlite_status(),
        "analysisNotes": [
            "The file header is FileMaker-like (HBAM7) and not a Windows PE DLL.",
            "Direct table and field names from Recover.log were used as the schema map.",
            "Simple strings extraction is intentionally not used as the primary method here.",
            "Many raw table-id matches are false positives because FileMaker page headers contain page pointers.",
            "Zlib streams were carved when signatures 78 01/78 9c/78 da were present; most readable streams appear to be layout/image resources unless product/schema hits are reported.",
            "No sale is exported as authoritative unless a candidate includes business values plus table context.",
        ],
    }
    write_json(args.output.resolve(), output_payload)

    print(
        json.dumps(
            {
                "status": status,
                "output": str(args.output.resolve()),
                "recordsFound": len(records),
                "candidatePagesFound": len(candidates),
                "zlibBlocksFound": len(zlib_findings),
                "carvedPages": carved_report["pagesWritten"] if carved_report else 0,
                "fmp2sqliteAvailable": fmp2sqlite_status()["availableInPath"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
