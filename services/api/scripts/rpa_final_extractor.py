from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import pyautogui
import pyperclip


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client  # noqa: E402


pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.04

DESIGN_WIDTH = 1920
DESIGN_HEIGHT = 1032
DEFAULT_WINDOW_TITLE = "kkkkk"
DEFAULT_LOG_DIR = ROOT / "logs"
DEFAULT_STATE_DB = DEFAULT_LOG_DIR / "rpa_final_extractor_state.sqlite3"
MIGRATION_USER = "migration:filemaker-rpa-final"


@dataclass(frozen=True)
class Point:
    x: int
    y: int


@dataclass(frozen=True)
class ColumnPoint:
    name: str
    x: int


@dataclass(frozen=True)
class WindowGeometry:
    left: int
    top: int
    width: int
    height: int

    def point(self, x: int, y: int) -> tuple[int, int]:
        return (
            self.left + round(x * self.width / DESIGN_WIDTH),
            self.top + round(y * self.height / DESIGN_HEIGHT),
        )


@dataclass(frozen=True)
class ProductLine:
    nombre: str
    cantidad: int
    precio_vendido_centavos: int

    @property
    def subtotal_centavos(self) -> int:
        return self.cantidad * self.precio_vendido_centavos

    def to_snapshot(self, index: int) -> dict[str, Any]:
        return {
            "productoId": f"filemaker-rpa-row-{index + 1}",
            "nombre": self.nombre,
            "marca": None,
            "sku": None,
            "categoria": "Migrado FileMaker",
            "cantidad": self.cantidad,
            "precioVentaCentavos": self.precio_vendido_centavos,
            "precioVendidoCentavos": self.precio_vendido_centavos,
            "subtotalCentavos": self.subtotal_centavos,
        }


@dataclass(frozen=True)
class ExtractedHeader:
    no_comprobante: str
    fecha_local: str
    hora_local: str
    cliente: str
    total_centavos: int
    raw: dict[str, str]


@dataclass(frozen=True)
class ExtractedSale:
    doc_id: str
    header: ExtractedHeader
    products: list[ProductLine]
    valid: bool
    validation: dict[str, Any]

    def to_firestore(self) -> dict[str, Any]:
        productos = [line.to_snapshot(index) for index, line in enumerate(self.products)]
        return {
            "productos": productos,
            "totalCentavos": self.header.total_centavos,
            "recibidoCentavos": self.header.total_centavos,
            "cambioCentavos": 0,
            "metodo": "Efectivo",
            "fechaLocal": self.header.fecha_local,
            "horaLocal": self.header.hora_local,
            "estado": True,
            "createdBy": MIGRATION_USER,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "migrated": True,
            "legacy": {
                "source": "FileMaker Pro 12",
                "method": "rpa_final_extractor",
                "noComprobante": self.header.no_comprobante,
                "cliente": self.header.cliente,
                "validation": self.validation,
                "rawHeader": self.header.raw,
                "migratedAt": datetime.utcnow().isoformat() + "Z",
            },
        }


HEADER_POINTS = {
    "no_comprobante": Point(704, 153),
    "fecha": Point(704, 174),
    "cliente": Point(246, 242),
    "hora": Point(1286, 120),
    "total": Point(412, 665),
}

PRODUCT_COLUMNS = [
    ColumnPoint("cantidad", 42),
    ColumnPoint("articulo", 281),
    ColumnPoint("precio", 532),
]


def ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def setup_logging(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / f"rpa_final_extractor_{ts()}.log"
    logging.basicConfig(
        filename=log_path,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(console)
    return log_path


def write_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"auditWrittenAt": datetime.now().isoformat(), **payload}
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")


def parse_money_centavos(value: str) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    text = re.sub(r"[^0-9,.\-]", "", text)
    if not text or text in {"-", ".", ","}:
        return None
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    else:
        text = text.replace(",", ".")
    try:
        amount = Decimal(text).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    if amount < 0:
        return None
    return int(amount * 100)


def parse_int(value: str) -> int | None:
    text = clean_text(value)
    match = re.search(r"-?\d+", text)
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def parse_filemaker_date(value: str, order: str) -> str | None:
    text = clean_text(value)
    match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", text)
    if not match:
        return None
    first, second, year_text = match.groups()
    year = int(year_text)
    if year < 100:
        year += 2000
    if order == "dmy":
        day, month = int(first), int(second)
    else:
        month, day = int(first), int(second)
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def normalize_signature(*parts: str) -> str:
    return "|".join(re.sub(r"\W+", "", clean_text(part).casefold()) for part in parts)


def sale_doc_id(header: ExtractedHeader, products: list[ProductLine]) -> str:
    material = {
        "no_comprobante": header.no_comprobante,
        "fecha": header.fecha_local,
        "total": header.total_centavos,
        "products": [asdict(product) for product in products],
    }
    digest = hashlib.sha1(json.dumps(material, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:14]
    number = re.sub(r"[^0-9A-Za-z_-]", "", header.no_comprobante) or "sin_numero"
    return f"filemaker_rpa_{number}_{digest}"


class MigrationState:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path))
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS migrated_sales (
                doc_id TEXT PRIMARY KEY,
                no_comprobante TEXT,
                status TEXT NOT NULL,
                total_centavos INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def is_done(self, doc_id: str, *, include_dry_run: bool) -> bool:
        row = self.connection.execute(
            "SELECT status FROM migrated_sales WHERE doc_id = ?",
            (doc_id,),
        ).fetchone()
        done_statuses = {"uploaded", "skipped_existing"}
        if include_dry_run:
            done_statuses.add("dry_run_valid")
        return bool(row and row[0] in done_statuses)

    def mark(
        self,
        doc_id: str,
        no_comprobante: str,
        status: str,
        total_centavos: int,
        error: str | None = None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO migrated_sales(doc_id, no_comprobante, status, total_centavos, error, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                no_comprobante = excluded.no_comprobante,
                status = excluded.status,
                total_centavos = excluded.total_centavos,
                error = excluded.error,
                updated_at = excluded.updated_at
            """,
            (doc_id, no_comprobante, status, int(total_centavos), error, datetime.now().isoformat()),
        )
        self.connection.commit()


class ReadOnlyFileMakerRpa:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.geometry = self.find_window(args.window_title)

    def find_window(self, title: str) -> WindowGeometry:
        windows = pyautogui.getWindowsWithTitle(title)
        if not windows:
            raise RuntimeError(f"No encontre una ventana con titulo que contenga: {title}")
        window = windows[0]
        if getattr(window, "isMinimized", False):
            window.restore()
            time.sleep(0.4)
        window.activate()
        time.sleep(0.4)
        if window.width < 1200 or window.height < 700:
            window.maximize()
            time.sleep(0.5)
        return WindowGeometry(window.left, window.top, window.width, window.height)

    def click(self, x: int, y: int) -> None:
        px, py = self.geometry.point(x, y)
        pyautogui.click(px, py)

    def press_escape(self) -> None:
        pyautogui.press("esc")
        time.sleep(0.08)

    def press_down(self) -> None:
        pyautogui.press("down")
        time.sleep(self.args.row_advance_pause)

    def ctrl_a_ctrl_c(self) -> None:
        pyautogui.hotkey("ctrl", "a")
        time.sleep(0.04)
        pyautogui.hotkey("ctrl", "c")

    def copy_at(self, point: Point) -> str:
        sentinel = f"__AUDIDISC_RPA_SENTINEL_{time.time_ns()}__"
        try:
            self.click(point.x, point.y)
            time.sleep(self.args.focus_pause)
            pyperclip.copy(sentinel)
            self.ctrl_a_ctrl_c()
            time.sleep(self.args.copy_pause)
            copied = pyperclip.paste()
            if copied == sentinel:
                self.press_escape()
                return ""
            return clean_text(copied)
        except pyautogui.FailSafeException:
            raise
        except Exception as exc:
            logging.warning("Copy failed at %s: %s", point, exc)
            self.press_escape()
            return ""

    def copy_cell(self, x: int, y: int) -> str:
        return self.copy_at(Point(x, y))

    def screenshot_probe(self, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / f"rpa_final_probe_{ts()}.png"
        screenshot = pyautogui.screenshot(
            region=(self.geometry.left, self.geometry.top, self.geometry.width, self.geometry.height)
        )
        screenshot.save(path)
        return path

    def wait_after_navigation(self) -> None:
        time.sleep(self.args.navigation_pause)

    def next_record(self) -> None:
        self.press_escape()
        self.click(self.args.next_button_x, self.args.next_button_y)
        self.wait_after_navigation()

    def extract_header(self) -> ExtractedHeader | None:
        raw = {name: self.copy_at(point) for name, point in HEADER_POINTS.items()}
        fecha = parse_filemaker_date(raw.get("fecha", ""), self.args.date_order)
        total = parse_money_centavos(raw.get("total", ""))
        no_comprobante = clean_text(raw.get("no_comprobante"))
        cliente = clean_text(raw.get("cliente")) or "Sin Nombre"
        hora = clean_text(raw.get("hora")) or "00:00:00"
        if not fecha or total is None or not no_comprobante:
            return None
        return ExtractedHeader(
            no_comprobante=no_comprobante,
            fecha_local=fecha,
            hora_local=hora,
            cliente=cliente,
            total_centavos=total,
            raw=raw,
        )

    def extract_products(self) -> list[ProductLine]:
        products: list[ProductLine] = []
        previous_signature = ""
        empty_rows = 0
        first_y = self.args.product_first_row_y
        max_rows = self.args.max_product_rows

        self.click(self.args.product_first_articulo_x, first_y)
        time.sleep(self.args.focus_pause)

        for row_index in range(max_rows):
            visible_index = min(row_index, self.args.visible_product_rows - 1)
            y = first_y + visible_index * self.args.product_row_height
            raw_row = {column.name: self.copy_cell(column.x, y) for column in PRODUCT_COLUMNS}
            articulo = clean_text(raw_row.get("articulo"))
            cantidad = parse_int(raw_row.get("cantidad", ""))
            precio = parse_money_centavos(raw_row.get("precio", ""))
            signature = normalize_signature(raw_row.get("cantidad", ""), articulo, raw_row.get("precio", ""))

            if not articulo and cantidad is None and precio is None:
                empty_rows += 1
                if empty_rows >= self.args.empty_row_stop_count:
                    break
                self.press_down()
                continue

            empty_rows = 0
            if signature and signature == previous_signature:
                logging.info("Producto repetido consecutivo detectado; fin de tabla: %s", raw_row)
                break
            previous_signature = signature

            if articulo and cantidad is not None and precio is not None and cantidad > 0 and precio > 0:
                products.append(ProductLine(nombre=articulo, cantidad=cantidad, precio_vendido_centavos=precio))
            else:
                logging.info("Fila de producto incompleta omitida: %s", raw_row)

            self.press_down()

        self.press_escape()
        return products

    def extract_sale(self) -> ExtractedSale | None:
        header = self.extract_header()
        if header is None:
            return None
        products = self.extract_products()
        doc_id = sale_doc_id(header, products)
        items_total = sum(product.subtotal_centavos for product in products)
        diff = items_total - header.total_centavos
        valid = bool(products) and abs(diff) <= self.args.tolerance_centavos
        validation = {
            "valid": valid,
            "itemsTotalCentavos": items_total,
            "headerTotalCentavos": header.total_centavos,
            "differenceCentavos": diff,
            "productCount": len(products),
            "toleranceCentavos": self.args.tolerance_centavos,
        }
        return ExtractedSale(doc_id=doc_id, header=header, products=products, valid=valid, validation=validation)


def upload_sale(db: Any, sale: ExtractedSale, *, overwrite: bool) -> str:
    doc_ref = db.collection("ventas").document(sale.doc_id)
    if doc_ref.get().exists and not overwrite:
        return "skipped_existing"
    doc_ref.set(sale.to_firestore(), merge=overwrite)
    return "uploaded"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extractor RPA final no intrusivo para FileMaker/Audi Disc.")
    parser.add_argument("--window-title", default=DEFAULT_WINDOW_TITLE)
    parser.add_argument("--max-records", type=int, default=20)
    parser.add_argument("--commit", action="store_true", help="Sube solo ventas validadas a Firestore.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--probe", action="store_true", help="Solo guarda screenshot de calibracion.")
    parser.add_argument("--date-order", choices=["mdy", "dmy"], default="mdy")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_LOG_DIR)
    parser.add_argument("--state-db", type=Path, default=DEFAULT_STATE_DB)
    parser.add_argument("--focus-pause", type=float, default=0.30)
    parser.add_argument("--copy-pause", type=float, default=0.10)
    parser.add_argument("--navigation-pause", type=float, default=0.55)
    parser.add_argument("--row-advance-pause", type=float, default=0.12)
    parser.add_argument("--tolerance-centavos", type=int, default=0)
    parser.add_argument("--stop-on-repeated-sale", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--next-button-x", type=int, default=1185)
    parser.add_argument("--next-button-y", type=int, default=667)
    parser.add_argument("--product-first-row-y", type=int, default=307)
    parser.add_argument("--product-row-height", type=int, default=32)
    parser.add_argument("--visible-product-rows", type=int, default=11)
    parser.add_argument("--max-product-rows", type=int, default=80)
    parser.add_argument("--empty-row-stop-count", type=int, default=2)
    parser.add_argument("--product-first-articulo-x", type=int, default=281)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir = args.output_dir.resolve()
    args.state_db = args.state_db.resolve()
    log_path = setup_logging(args.output_dir)
    audit_path = args.output_dir / f"rpa_final_extractor_{ts()}.jsonl"
    logging.info("Log: %s", log_path)
    logging.info("Audit JSONL: %s", audit_path)
    logging.info("Modo solo lectura: click + Ctrl+A/Ctrl+C + Down + Esc. Commit Firestore: %s", args.commit)

    rpa = ReadOnlyFileMakerRpa(args)
    if args.probe:
        path = rpa.screenshot_probe(args.output_dir)
        logging.info("Probe guardado: %s", path)
        print(path)
        return

    state = MigrationState(args.state_db)
    db = get_firestore_client() if args.commit else None
    processed = 0
    uploaded = 0
    invalid = 0
    errors = 0
    last_doc_id = ""

    for index in range(args.max_records):
        try:
            sale = rpa.extract_sale()
            if sale is None:
                invalid += 1
                write_jsonl(audit_path, {"status": "invalid_header", "index": index + 1})
                rpa.next_record()
                continue

            if args.stop_on_repeated_sale and sale.doc_id == last_doc_id:
                logging.info("Venta repetida detectada. Se detiene para evitar bucle: %s", sale.doc_id)
                break
            last_doc_id = sale.doc_id
            processed += 1

            audit = {
                "index": index + 1,
                "docId": sale.doc_id,
                "noComprobante": sale.header.no_comprobante,
                "fechaLocal": sale.header.fecha_local,
                "cliente": sale.header.cliente,
                "totalCentavos": sale.header.total_centavos,
                "productos": [asdict(product) for product in sale.products],
                "validation": sale.validation,
            }

            if not sale.valid:
                invalid += 1
                state.mark(
                    sale.doc_id,
                    sale.header.no_comprobante,
                    "invalid_total",
                    sale.header.total_centavos,
                    json.dumps(sale.validation, ensure_ascii=False),
                )
                write_jsonl(audit_path, {"status": "invalid_total", **audit})
                logging.warning("Venta no subida por integridad: %s %s", sale.doc_id, sale.validation)
                rpa.next_record()
                continue

            if state.is_done(sale.doc_id, include_dry_run=not args.commit) and not args.overwrite:
                state.mark(sale.doc_id, sale.header.no_comprobante, "skipped_state", sale.header.total_centavos)
                write_jsonl(audit_path, {"status": "skipped_state", **audit})
                rpa.next_record()
                continue

            if args.commit:
                assert db is not None
                status = upload_sale(db, sale, overwrite=args.overwrite)
                if status == "uploaded":
                    uploaded += 1
                state.mark(sale.doc_id, sale.header.no_comprobante, status, sale.header.total_centavos)
                write_jsonl(audit_path, {"status": status, **audit})
            else:
                state.mark(sale.doc_id, sale.header.no_comprobante, "dry_run_valid", sale.header.total_centavos)
                write_jsonl(audit_path, {"status": "dry_run_valid", **audit})

            rpa.next_record()
        except pyautogui.FailSafeException:
            logging.error("Failsafe activado por mouse en esquina. Extraccion detenida.")
            break
        except Exception as exc:
            errors += 1
            logging.exception("Error procesando registro %s", index + 1)
            write_jsonl(audit_path, {"status": "error", "index": index + 1, "error": str(exc)})
            try:
                rpa.press_escape()
                rpa.next_record()
            except Exception:
                logging.exception("No se pudo recuperar navegando al siguiente registro.")
                break

    summary = {
        "processed": processed,
        "uploaded": uploaded,
        "invalid": invalid,
        "errors": errors,
        "auditPath": str(audit_path),
        "stateDb": str(args.state_db),
        "commit": args.commit,
    }
    summary_path = args.output_dir / f"rpa_final_extractor_summary_{ts()}.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**summary, "summaryPath": str(summary_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
