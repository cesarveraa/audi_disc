from __future__ import annotations

import argparse
import json
import math
import re
import string
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


AUDISC_DIR = Path(r"C:\a\Audisc2")
DEFAULT_INPUT = AUDISC_DIR / "FMbil_BDD Recovered.dll"
DEFAULT_PRODUCTS = AUDISC_DIR / "productos.xlsx"
DEFAULT_OUTPUT = AUDISC_DIR / "ventas_directas.json"
DEFAULT_REPORT = AUDISC_DIR / "ventas_directas_report.json"
DEFAULT_STRINGS = AUDISC_DIR / "ventas_directas_strings.jsonl"
DEFAULT_RECOVER_LOG = AUDISC_DIR / "Recover.log"

SCHEMA_KEYWORDS = {
    "producto",
    "Temp_FacturaVenta",
    "DetalleFactura",
    "Libro_Venta_mes",
    "Clientes",
    "FechaCprobte",
    "RazonSocialCliente",
    "NumCprobte",
    "TotalGeneral",
    "SubtotalTotal",
    "Articulo",
    "Cantidad",
    "PrecioUnitario",
    "PrecioCompra",
    "Idtempfac",
    "numventas",
    "TotalFactura",
    "Nom_Cliente",
    "Pago",
    "Vuelto",
    "Utilidad",
}

ANCHOR_TERMS = {
    "EWTTO",
    "WAHL",
    "GENIUS",
    "BOLSAS",
    "VITRINA",
    "MAZA",
    "EPSON",
    "DURACELL",
    "SONY",
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
    "CUADRADO",
}

NOISE_CONTEXT_TERMS = {
    "xmpmeta",
    "Adobe Photoshop",
    "rdf:RDF",
    "CreatorTool",
    "MetadataDate",
    "image/png",
    "accent_color",
    "body_button",
    "column_header_region",
}

SALES_SCHEMA_TERMS = {
    "DetalleFactura",
    "Libro_Venta_mes",
    "FechaCprobte",
    "RazonSocialCliente",
    "NumCprobte",
    "TotalGeneral",
    "SubtotalTotal",
    "PrecioUnitario",
    "TotalFactura",
    "Nom_Cliente",
    "Pago",
    "Vuelto",
    "numventas",
}

DATE_RE = re.compile(
    r"\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b"
)
AMOUNT_RE = re.compile(r"(?<!\w)(?:\d{1,3}(?:[.,]\d{3})+|\d{1,6})[.,]\d{2}(?!\w)")
SALE_NUMBER_RE = re.compile(r"\b(?:v|numventas|NumCprobte|N[°o]\s*:?)[\s:#-]*(\d{1,7})\b", re.IGNORECASE)


@dataclass(frozen=True)
class ExtractedString:
    offset: int
    encoding: str
    text: str


@dataclass(frozen=True)
class Hit:
    offset: int
    encoding: str
    kind: str
    value: str
    context: str


@dataclass(frozen=True)
class CandidateBlock:
    start: int
    end: int
    score: int
    dates: list[str]
    amounts: list[str]
    products: list[str]
    schema_terms: list[str]
    sale_numbers: list[str]
    text_excerpt: str


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\x00", " ")
    return re.sub(r"\s+", " ", text).strip()


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def is_printable_text_char(char: str) -> bool:
    if char in "\t\r\n":
        return True
    if char in string.printable and char not in "\x0b\x0c":
        return True
    category = ord(char)
    return category >= 0xA0 and not char.isspace() or char == " "


def printable_ratio(text: str) -> float:
    if not text:
        return 0.0
    printable = sum(1 for char in text if is_printable_text_char(char))
    return printable / len(text)


def latin_text_ratio(text: str) -> float:
    if not text:
        return 0.0
    accepted = 0
    for char in text:
        code = ord(char)
        if char in "\t\r\n " or 32 <= code <= 126 or 0x00A0 <= code <= 0x024F:
            accepted += 1
    return accepted / len(text)


def looks_like_human_text(text: str) -> bool:
    if len(text) < 5:
        return False
    if printable_ratio(text) < 0.92:
        return False
    if latin_text_ratio(text) < 0.72:
        return False
    alnum = sum(1 for char in text if char.isalnum())
    return alnum >= max(2, min(len(text), 20) // 4)


def extract_utf8_strings(data: bytes, min_length: int) -> list[ExtractedString]:
    results: list[ExtractedString] = []
    start: int | None = None
    buffer = bytearray()

    def flush(end_offset: int) -> None:
        nonlocal start, buffer
        if start is not None and len(buffer) >= min_length:
            for encoding in ("utf-8", "cp1252", "latin-1"):
                try:
                    text = buffer.decode(encoding)
                except UnicodeDecodeError:
                    continue
                text = clean_text(text)
                if len(text) >= min_length and looks_like_human_text(text):
                    results.append(ExtractedString(start, "utf-8" if encoding == "utf-8" else encoding, text))
                    break
        start = None
        buffer = bytearray()

    for index, byte in enumerate(data):
        if byte in (9, 10, 13) or 32 <= byte <= 126 or byte >= 0xC2:
            if start is None:
                start = index
            buffer.append(byte)
        else:
            flush(index)
    flush(len(data))
    return results


def extract_utf16_strings(data: bytes, min_length: int, encoding: str) -> list[ExtractedString]:
    results: list[ExtractedString] = []
    latin_byte = rb"[\x09\x0A\x0D\x20-\x7E\xA0-\xFF]"
    if encoding == "utf-16-le":
        pattern = re.compile(rb"(?:" + latin_byte + rb"\x00){" + str(min_length).encode() + rb",}")
    else:
        pattern = re.compile(rb"(?:\x00" + latin_byte + rb"){" + str(min_length).encode() + rb",}")
    for match in pattern.finditer(data):
        try:
            text = clean_text(match.group(0).decode(encoding))
        except UnicodeDecodeError:
            continue
        if len(text) >= min_length and looks_like_human_text(text):
            results.append(ExtractedString(match.start(), encoding, text))
    return results


def dedupe_strings(strings_found: Iterable[ExtractedString]) -> list[ExtractedString]:
    seen: set[tuple[int, str, str]] = set()
    deduped: list[ExtractedString] = []
    for item in sorted(strings_found, key=lambda value: (value.offset, value.encoding, value.text)):
        key = (item.offset, item.encoding, item.text)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def load_product_terms(path: Path, max_terms: int) -> list[str]:
    terms: set[str] = set(ANCHOR_TERMS)
    if path.exists():
        if path.suffix.lower() in {".xlsx", ".xls"}:
            df = pd.read_excel(path)
        else:
            df = pd.read_csv(path)
        normalized_columns = {normalize(column): column for column in df.columns}
        article_column = normalized_columns.get("articulo") or normalized_columns.get("nombre")
        if article_column:
            for value in df[article_column].dropna().astype(str):
                text = clean_text(value)
                if len(text) >= 4:
                    terms.add(text[:120])
                for token in re.findall(r"[A-Za-z0-9]{4,}", text):
                    upper = token.upper()
                    if upper in ANCHOR_TERMS and upper not in GENERIC_PRODUCT_TOKENS:
                        terms.add(token.upper())
    return sorted(terms, key=lambda value: (-len(value), value))[:max_terms]


def is_noise_context(text: str) -> bool:
    return any(term.casefold() in text.casefold() for term in NOISE_CONTEXT_TERMS)


def is_strong_product_term(term: str) -> bool:
    upper = term.upper()
    if upper in ANCHOR_TERMS and upper not in GENERIC_PRODUCT_TOKENS:
        return True
    if upper in GENERIC_PRODUCT_TOKENS:
        return False
    words = re.findall(r"[A-Za-z0-9]{3,}", term)
    return len(term) >= 12 and len(words) >= 2


def make_context(text: str, needle: str, width: int = 160) -> str:
    lowered = text.casefold()
    index = lowered.find(needle.casefold())
    if index < 0:
        return text[:width]
    start = max(0, index - width // 2)
    end = min(len(text), index + len(needle) + width // 2)
    return text[start:end]


def find_hits(strings_found: list[ExtractedString], product_terms: list[str]) -> list[Hit]:
    hits: list[Hit] = []
    anchor_product_terms = sorted(set(ANCHOR_TERMS) | {term for term in product_terms if term.upper() in ANCHOR_TERMS})
    normalized_terms = [(term, normalize(term)) for term in anchor_product_terms if len(normalize(term)) >= 4]
    normalized_schema = [(term, normalize(term)) for term in SCHEMA_KEYWORDS]

    for item in strings_found:
        text = item.text
        normalized_text = normalize(text)
        noise = is_noise_context(text)
        has_date = bool(DATE_RE.search(text)) if not noise else False
        has_amount = bool(AMOUNT_RE.search(text)) if not noise else False
        has_sale_number = bool(SALE_NUMBER_RE.search(text)) if not noise else False
        has_schema = any(norm_term and norm_term in normalized_text for _, norm_term in normalized_schema)
        has_product = any(norm_term and norm_term in normalized_text for _, norm_term in normalized_terms) if not noise else False
        if not (has_date or has_amount or has_sale_number or has_schema or has_product):
            continue
        if has_date:
            for match in DATE_RE.finditer(text):
                hits.append(Hit(item.offset, item.encoding, "date", match.group(0), make_context(text, match.group(0))))
        if has_amount:
            for match in AMOUNT_RE.finditer(text):
                hits.append(Hit(item.offset, item.encoding, "amount", match.group(0), make_context(text, match.group(0))))
        if has_sale_number:
            for match in SALE_NUMBER_RE.finditer(text):
                hits.append(Hit(item.offset, item.encoding, "sale_number", match.group(1), make_context(text, match.group(0))))
        for term, norm_term in normalized_schema:
            if norm_term and norm_term in normalized_text:
                hits.append(Hit(item.offset, item.encoding, "schema", term, make_context(text, term)))
        if has_product:
            for term, norm_term in normalized_terms:
                if is_strong_product_term(term) and norm_term and norm_term in normalized_text:
                    hits.append(Hit(item.offset, item.encoding, "product", term, make_context(text, term)))
                    break
    return sorted(hits, key=lambda hit: hit.offset)


def strings_in_range(strings_found: list[ExtractedString], start: int, end: int) -> list[ExtractedString]:
    return [item for item in strings_found if start <= item.offset <= end]


def unique_ordered(values: Iterable[str], limit: int = 20) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        text = clean_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        ordered.append(text)
        if len(ordered) >= limit:
            break
    return ordered


def score_block(hits: list[Hit]) -> int:
    counts = Counter(hit.kind for hit in hits)
    return (
        counts["date"] * 5
        + counts["amount"] * 3
        + counts["product"] * 4
        + counts["sale_number"] * 3
        + min(counts["schema"], 8)
    )


def identify_blocks(
    strings_found: list[ExtractedString],
    hits: list[Hit],
    *,
    gap_bytes: int,
    min_score: int,
) -> list[CandidateBlock]:
    if not hits:
        return []
    blocks: list[list[Hit]] = []
    current: list[Hit] = [hits[0]]
    for hit in hits[1:]:
        if hit.offset - current[-1].offset <= gap_bytes:
            current.append(hit)
        else:
            blocks.append(current)
            current = [hit]
    blocks.append(current)

    candidates: list[CandidateBlock] = []
    for block_hits in blocks:
        score = score_block(block_hits)
        if score < min_score:
            continue
        start = max(0, block_hits[0].offset - 256)
        end = block_hits[-1].offset + 256
        block_strings = strings_in_range(strings_found, start, end)
        text_excerpt = clean_text(" | ".join(item.text for item in block_strings))[:3000]
        candidates.append(
            CandidateBlock(
                start=block_hits[0].offset,
                end=block_hits[-1].offset,
                score=score,
                dates=unique_ordered(hit.value for hit in block_hits if hit.kind == "date"),
                amounts=unique_ordered(hit.value for hit in block_hits if hit.kind == "amount"),
                products=unique_ordered(hit.value for hit in block_hits if hit.kind == "product"),
                schema_terms=unique_ordered(hit.value for hit in block_hits if hit.kind == "schema"),
                sale_numbers=unique_ordered(hit.value for hit in block_hits if hit.kind == "sale_number"),
                text_excerpt=text_excerpt,
            )
        )
    return sorted(candidates, key=lambda block: (-block.score, block.start))


def likely_sales_records(blocks: list[CandidateBlock]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for block in blocks:
        has_sales_schema = any(term in SALES_SCHEMA_TERMS for term in block.schema_terms)
        has_sales_shape = (
            bool(block.dates)
            and bool(block.amounts)
            and (bool(block.products) or bool(block.sale_numbers) or has_sales_schema)
            and not is_noise_context(block.text_excerpt)
        )
        if not has_sales_shape:
            continue
        records.append(
            {
                "confidence": "medium" if block.products else "low",
                "offsetStart": block.start,
                "offsetEnd": block.end,
                "fechas": block.dates,
                "montos": block.amounts[:12],
                "productosDetectados": block.products[:12],
                "numerosVenta": block.sale_numbers[:8],
                "schemaTerms": block.schema_terms[:12],
                "rawContext": block.text_excerpt,
            }
        )
    return records


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def parse_recover_log(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False, "tables": [], "fieldsByTable": {}}
    tables: list[str] = []
    fields_by_table: dict[str, list[str]] = {}
    current_table = ""
    table_re = re.compile(r"Recovering: table '([^']+)'")
    fields_for_table_re = re.compile(r"Recovering fields for table '([^']+)'")
    field_re = re.compile(r"Recovering: field '([^']+)'")
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        table_match = table_re.search(line)
        if table_match:
            table = table_match.group(1)
            if table not in tables:
                tables.append(table)
            continue
        fields_table_match = fields_for_table_re.search(line)
        if fields_table_match:
            current_table = fields_table_match.group(1)
            fields_by_table.setdefault(current_table, [])
            continue
        field_match = field_re.search(line)
        if field_match and current_table:
            fields_by_table.setdefault(current_table, []).append(field_match.group(1))
    return {
        "path": str(path),
        "exists": True,
        "tables": tables,
        "fieldsByTable": fields_by_table,
        "salesRelevantTables": {
            table: fields_by_table.get(table, [])
            for table in ("Temp_FacturaVenta", "DetalleFactura", "Libro_Venta_mes", "Clientes", "producto")
            if table in fields_by_table
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extrae strings y candidatos de ventas desde un binario FileMaker.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--products", type=Path, default=DEFAULT_PRODUCTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--strings-output", type=Path, default=DEFAULT_STRINGS)
    parser.add_argument("--recover-log", type=Path, default=DEFAULT_RECOVER_LOG)
    parser.add_argument("--min-length", type=int, default=5)
    parser.add_argument("--max-product-terms", type=int, default=2500)
    parser.add_argument("--gap-bytes", type=int, default=16_384)
    parser.add_argument("--min-score", type=int, default=10)
    parser.add_argument("--max-strings-jsonl", type=int, default=50_000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = args.input.resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"No existe el archivo binario: {input_path}")

    data = input_path.read_bytes()
    product_terms = load_product_terms(args.products.resolve(), args.max_product_terms)

    strings_found = dedupe_strings(
        [
            *extract_utf8_strings(data, args.min_length),
            *extract_utf16_strings(data, args.min_length, "utf-16-le"),
            *extract_utf16_strings(data, args.min_length, "utf-16-be"),
        ]
    )
    hits = find_hits(strings_found, product_terms)
    blocks = identify_blocks(strings_found, hits, gap_bytes=args.gap_bytes, min_score=args.min_score)
    records = likely_sales_records(blocks)

    sha256 = __import__("hashlib").sha256(data).hexdigest()
    status = "records_identified" if records else "no_complete_records_identified"
    payload = {
        "status": status,
        "sourceFile": str(input_path),
        "sha256": sha256,
        "fileSizeBytes": len(data),
        "productTermsLoaded": len(product_terms),
        "stringsExtracted": len(strings_found),
        "hitsFound": len(hits),
        "candidateBlocksFound": len(blocks),
        "recordsFound": len(records),
        "records": records,
        "candidateBlocks": [asdict(block) for block in blocks[:100]],
        "notes": [
            "FileMaker Pro 12 usa estructuras binarias propietarias; este extractor no descifra registros comprimidos o cifrados.",
            "Los offsets permiten volver al binario original y validar bloques contiguos.",
            "Si recordsFound es 0, usar ventas_directas_report.json y ventas_directas_strings.jsonl como reporte forense de evidencia.",
        ],
    }
    write_json(args.output.resolve(), payload)

    hit_counter = Counter(hit.kind for hit in hits)
    report = {
        "sourceFile": str(input_path),
        "sha256": sha256,
        "fileSizeBytes": len(data),
        "estimated4096Pages": math.ceil(len(data) / 4096),
        "productTermsSample": product_terms[:80],
        "stringsByEncoding": Counter(item.encoding for item in strings_found),
        "hitsByKind": dict(hit_counter),
        "topProductHits": Counter(hit.value for hit in hits if hit.kind == "product").most_common(80),
        "topSchemaHits": Counter(hit.value for hit in hits if hit.kind == "schema").most_common(80),
        "dateHits": [asdict(hit) for hit in hits if hit.kind == "date"][:300],
        "amountHits": [asdict(hit) for hit in hits if hit.kind == "amount"][:300],
        "productHits": [asdict(hit) for hit in hits if hit.kind == "product"][:1000],
        "schemaHits": [asdict(hit) for hit in hits if hit.kind == "schema"][:1000],
        "recoverLogSchema": parse_recover_log(args.recover_log.resolve()),
    }
    write_json(args.report.resolve(), report)

    selected_strings = []
    for item in strings_found:
        text = item.text
        if DATE_RE.search(text) or AMOUNT_RE.search(text) or any(term.casefold() in text.casefold() for term in ANCHOR_TERMS):
            selected_strings.append(asdict(item))
        if len(selected_strings) >= args.max_strings_jsonl:
            break
    write_jsonl(args.strings_output.resolve(), selected_strings)

    print(f"Archivo analizado: {input_path}")
    print(f"Strings extraidos: {len(strings_found)} | Hits: {len(hits)} | Bloques candidatos: {len(blocks)}")
    print(f"Registros candidatos: {len(records)}")
    print(f"Output: {args.output.resolve()}")
    print(f"Reporte: {args.report.resolve()}")
    print(f"Strings relevantes: {args.strings_output.resolve()}")


if __name__ == "__main__":
    main()
