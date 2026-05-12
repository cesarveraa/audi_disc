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

pyautogui: Any | None = None
pyperclip: Any | None = None
if sys.platform == "win32":
    try:
        import pyautogui
        import pyperclip
    except ModuleNotFoundError:
        pyautogui = None
        pyperclip = None


def require_windows_rpa() -> None:
    if sys.platform != "win32":
        raise RuntimeError("El extractor RPA de FileMaker solo puede ejecutarse en Windows.")
    missing = [
        name
        for name, module in (
            ("pyautogui", pyautogui),
            ("pyperclip", pyperclip),
        )
        if module is None
    ]
    if missing:
        raise RuntimeError(
            "Faltan dependencias RPA de Windows "
            f"({', '.join(missing)}). Instala con: python -m pip install -r services/api/requirements.txt"
        )


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client  # noqa: E402


if pyautogui is not None:
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.3

DESIGN_WIDTH = 1920
DESIGN_HEIGHT = 1032
DEFAULT_WINDOW_TITLE = "kkkkk"
FALLBACK_WINDOW_TITLES = ("FMbil", "Recovered", "FileMaker", ".fmp12")
DEFAULT_LOG_DIR = ROOT / "logs"
DEFAULT_STATE_DB = DEFAULT_LOG_DIR / "migration_state.db"
MIGRATION_USER = "migration:filemaker-clipboard-rpa"


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

    @property
    def area(self) -> int:
        return max(0, self.width) * max(0, self.height)


@dataclass(frozen=True)
class ProductLine:
    articulo: str
    cantidad: int
    precio_centavos: int

    @property
    def subtotal_centavos(self) -> int:
        return self.cantidad * self.precio_centavos

    def to_snapshot(self, index: int) -> dict[str, Any]:
        return {
            "productoId": f"filemaker-clipboard-row-{index + 1}",
            "nombre": self.articulo,
            "marca": None,
            "sku": None,
            "categoria": "Migrado FileMaker",
            "cantidad": self.cantidad,
            "precioVentaCentavos": self.precio_centavos,
            "precioVendidoCentavos": self.precio_centavos,
            "subtotalCentavos": self.subtotal_centavos,
        }


@dataclass(frozen=True)
class SaleHeader:
    no_comprobante: str
    fecha_local: str
    hora_local: str
    cliente: str
    total_centavos: int
    raw: dict[str, str]


@dataclass(frozen=True)
class ExtractedSale:
    record_number: int
    doc_id: str
    header: SaleHeader
    products: list[ProductLine]
    validation: dict[str, Any]

    @property
    def valid(self) -> bool:
        return bool(self.validation.get("valid"))

    def to_firestore(self) -> dict[str, Any]:
        return {
            "productos": [product.to_snapshot(index) for index, product in enumerate(self.products)],
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
                "method": "rpa_clipboard_extractor",
                "recordNumber": self.record_number,
                "noComprobante": self.header.no_comprobante,
                "cliente": self.header.cliente,
                "validation": self.validation,
                "rawHeader": self.header.raw,
                "migratedAt": datetime.utcnow().isoformat() + "Z",
            },
        }


# Coordinates are based on the 1920x1032 reference screenshot and scaled to the live window.
HEADER_POINTS = {
    "no_comprobante": Point(704, 153),
    "fecha": Point(704, 174),
    "cliente": Point(246, 242),
    "hora": Point(1286, 120),
    "total_factura": Point(412, 665),
}

PRODUCT_COLUMNS = [
    ColumnPoint("cantidad", 42),
    ColumnPoint("articulo", 281),
    ColumnPoint("precio", 532),
]


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def setup_logging(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"rpa_clipboard_extractor_{now_stamp()}.log"
    logging.basicConfig(
        filename=path,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(console)
    return path


def write_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"auditWrittenAt": datetime.now().isoformat(), **record}
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")


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


def parse_integer(value: str) -> int | None:
    match = re.search(r"-?\d+", clean_text(value))
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


def normalize_row_signature(values: dict[str, str]) -> str:
    return "|".join(re.sub(r"\W+", "", clean_text(values.get(key, "")).casefold()) for key in ("cantidad", "articulo", "precio"))


def build_doc_id(header: SaleHeader, products: list[ProductLine]) -> str:
    material = {
        "no_comprobante": header.no_comprobante,
        "fecha": header.fecha_local,
        "total": header.total_centavos,
        "products": [asdict(product) for product in products],
    }
    digest = hashlib.sha1(json.dumps(material, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:14]
    comprobante = re.sub(r"[^0-9A-Za-z_-]", "", header.no_comprobante) or "sin_numero"
    return f"filemaker_clipboard_{comprobante}_{digest}"


def format_centavos(value: int) -> str:
    return f"Bs {value / 100:,.2f}"


def print_sale_summary(status: str, sale: ExtractedSale) -> None:
    print(
        f"[{status}] Registro {sale.record_number} | Comp. {sale.header.no_comprobante} | "
        f"{sale.header.fecha_local} | {sale.header.cliente} | Total {format_centavos(sale.header.total_centavos)}"
    )
    for index, product in enumerate(sale.products, start=1):
        print(
            f"  {index:02d}. {product.cantidad} x {product.articulo} "
            f"@ {format_centavos(product.precio_centavos)} = {format_centavos(product.subtotal_centavos)}"
        )
    print(
        "  Validacion: "
        f"items={format_centavos(int(sale.validation['itemsTotalCentavos']))}, "
        f"cabecera={format_centavos(int(sale.validation['headerTotalCentavos']))}, "
        f"diff={int(sale.validation['differenceCentavos'])} centavos"
    )


class MigrationState:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path))
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS migration_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_record_number INTEGER NOT NULL DEFAULT 0,
                last_doc_id TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS migrated_sales (
                doc_id TEXT PRIMARY KEY,
                record_number INTEGER NOT NULL,
                no_comprobante TEXT,
                status TEXT NOT NULL,
                total_centavos INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.connection.execute(
            """
            INSERT OR IGNORE INTO migration_state(id, last_record_number, last_doc_id, updated_at)
            VALUES(1, 0, NULL, ?)
            """,
            (datetime.now().isoformat(),),
        )
        self.connection.commit()

    def last_record_number(self) -> int:
        row = self.connection.execute("SELECT last_record_number FROM migration_state WHERE id = 1").fetchone()
        return int(row[0]) if row else 0

    def already_uploaded(self, doc_id: str) -> bool:
        row = self.connection.execute("SELECT status FROM migrated_sales WHERE doc_id = ?", (doc_id,)).fetchone()
        return bool(row and row[0] in {"uploaded", "skipped_existing"})

    def mark_cursor(self, record_number: int, doc_id: str | None = None) -> None:
        self.connection.execute(
            """
            UPDATE migration_state
            SET last_record_number = ?, last_doc_id = COALESCE(?, last_doc_id), updated_at = ?
            WHERE id = 1
            """,
            (record_number, doc_id, datetime.now().isoformat()),
        )
        self.connection.commit()

    def mark_sale(
        self,
        *,
        doc_id: str,
        record_number: int,
        no_comprobante: str,
        status: str,
        total_centavos: int,
        error: str | None = None,
    ) -> None:
        now = datetime.now().isoformat()
        self.connection.execute(
            """
            INSERT INTO migrated_sales(doc_id, record_number, no_comprobante, status, total_centavos, error, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                record_number = excluded.record_number,
                no_comprobante = excluded.no_comprobante,
                status = excluded.status,
                total_centavos = excluded.total_centavos,
                error = excluded.error,
                updated_at = excluded.updated_at
            """,
            (doc_id, record_number, no_comprobante, status, int(total_centavos), error, now),
        )
        self.connection.execute(
            """
            UPDATE migration_state
            SET last_record_number = ?, last_doc_id = ?, updated_at = ?
            WHERE id = 1
            """,
            (record_number, doc_id, now),
        )
        self.connection.commit()


class ClipboardFileMakerRpa:
    def __init__(self, args: argparse.Namespace) -> None:
        require_windows_rpa()
        self.args = args
        self.window_title = args.window_title
        self.window = self.find_main_window()
        actual_title = clean_text(getattr(self.window, "title", ""))
        if actual_title and self.window_title.lower() not in actual_title.lower():
            self.window_title = actual_title
        self.geometry = self.window_geometry(self.window)
        self.ensure_foreground("initialization")

    def find_main_window(self):
        windows = pyautogui.getWindowsWithTitle(self.window_title)
        if windows:
            return windows[0]

        all_windows = [window for window in pyautogui.getAllWindows() if clean_text(getattr(window, "title", ""))]
        for fallback in FALLBACK_WINDOW_TITLES:
            fallback_matches = [
                window
                for window in all_windows
                if fallback.lower() in clean_text(getattr(window, "title", "")).lower()
            ]
            if fallback_matches:
                logging.warning(
                    "No encontre titulo %r; usando ventana fallback %r.",
                    self.window_title,
                    clean_text(fallback_matches[0].title),
                )
                return fallback_matches[0]
        visible_titles = [clean_text(window.title) for window in all_windows[:20]]
        raise RuntimeError(
            f"No encontre una ventana con titulo que contenga: {self.window_title}. "
            f"Titulos visibles: {visible_titles}"
        )

    def window_geometry(self, window: Any) -> WindowGeometry:
        return WindowGeometry(left=window.left, top=window.top, width=window.width, height=window.height)

    def refresh_geometry(self) -> None:
        self.window = self.find_main_window()
        self.geometry = self.window_geometry(self.window)

    def emergency_cleanup(self, reason: str) -> None:
        logging.warning("Limpieza de emergencia por posible dialogo/foco perdido: %s", reason)
        pyautogui.press("esc")
        time.sleep(0.2)

    def active_window_title(self) -> str:
        active = pyautogui.getActiveWindow()
        return clean_text(getattr(active, "title", "") if active is not None else "")

    def active_window_looks_like_dialog(self) -> bool:
        active = pyautogui.getActiveWindow()
        if active is None:
            return False
        active_geometry = self.window_geometry(active)
        if self.window_title.lower() not in clean_text(active.title).lower():
            return True
        return active_geometry.area < self.geometry.area * 0.45

    def ensure_foreground(self, reason: str) -> None:
        self.refresh_geometry()
        if getattr(self.window, "isMinimized", False):
            self.window.restore()
            time.sleep(0.4)
        try:
            self.window.activate()
        except Exception:
            self.emergency_cleanup(f"activate failed during {reason}")
            self.window.activate()
        time.sleep(0.2)
        if self.geometry.width < 1200 or self.geometry.height < 700:
            self.window.maximize()
            time.sleep(0.5)
            self.refresh_geometry()
        active_title = self.active_window_title()
        if self.window_title.lower() not in active_title.lower():
            self.emergency_cleanup(f"active window is {active_title!r} during {reason}")
            self.window.activate()
            time.sleep(0.2)
        elif self.active_window_looks_like_dialog():
            self.emergency_cleanup(f"possible modal dialog during {reason}")
            self.window.activate()
            time.sleep(0.2)

    def scaled_point(self, point: Point) -> tuple[int, int]:
        return self.geometry.point(point.x, point.y)

    def click_point(self, point: Point) -> None:
        self.ensure_foreground("click")
        x, y = self.scaled_point(point)
        pyautogui.click(x, y)

    def copy_field(self, point: Point, field_name: str) -> str:
        sentinel = f"__AUDIDISC_EMPTY_{time.time_ns()}__"
        try:
            self.ensure_foreground(f"copy {field_name}")
            self.click_point(point)
            time.sleep(self.args.focus_pause)
            pyperclip.copy(sentinel)
            pyautogui.hotkey("ctrl", "a")
            pyautogui.hotkey("ctrl", "c")
            time.sleep(self.args.copy_pause)
            value = pyperclip.paste()
            if value == sentinel:
                self.emergency_cleanup(f"clipboard unchanged for {field_name}")
                return ""
            return clean_text(value)
        except pyautogui.FailSafeException:
            raise
        except Exception as exc:
            self.emergency_cleanup(f"copy failed for {field_name}: {exc}")
            return ""

    def next_record(self) -> None:
        self.ensure_foreground("next record")
        self.emergency_cleanup("before next record")
        x, y = self.geometry.point(self.args.next_button_x, self.args.next_button_y)
        pyautogui.click(x, y)
        time.sleep(self.args.navigation_pause)
        self.ensure_foreground("after next record")

    def previous_record(self) -> None:
        self.ensure_foreground("previous record")
        self.emergency_cleanup("before previous record")
        x, y = self.geometry.point(self.args.previous_button_x, self.args.previous_button_y)
        pyautogui.click(x, y)
        time.sleep(self.args.navigation_pause)
        self.ensure_foreground("after previous record")

    def rewind_records(self, count: int) -> None:
        for _ in range(max(0, count)):
            self.previous_record()

    def extract_header(self) -> SaleHeader | None:
        raw = {name: self.copy_field(point, name) for name, point in HEADER_POINTS.items()}
        fecha_local = parse_filemaker_date(raw.get("fecha", ""), self.args.date_order)
        total_centavos = parse_money_centavos(raw.get("total_factura", ""))
        no_comprobante = clean_text(raw.get("no_comprobante"))
        cliente = clean_text(raw.get("cliente")) or "Sin Nombre"
        hora_local = clean_text(raw.get("hora")) or "00:00:00"
        if not no_comprobante or not fecha_local or total_centavos is None:
            logging.warning("Cabecera incompleta: %s", raw)
            return None
        return SaleHeader(
            no_comprobante=no_comprobante,
            fecha_local=fecha_local,
            hora_local=hora_local,
            cliente=cliente,
            total_centavos=total_centavos,
            raw=raw,
        )

    def extract_products(self) -> list[ProductLine]:
        products: list[ProductLine] = []
        last_signature = ""
        empty_rows = 0
        first_y = self.args.product_first_row_y
        self.click_point(Point(self.args.product_articulo_x, first_y))
        time.sleep(self.args.focus_pause)

        for row_index in range(self.args.max_product_rows):
            visible_index = min(row_index, self.args.visible_product_rows - 1)
            y = first_y + visible_index * self.args.product_row_height
            raw = {
                column.name: self.copy_field(Point(column.x, y), f"product.{column.name}.{row_index + 1}")
                for column in PRODUCT_COLUMNS
            }
            signature = normalize_row_signature(raw)
            articulo = clean_text(raw.get("articulo"))
            cantidad = parse_integer(raw.get("cantidad", ""))
            precio_centavos = parse_money_centavos(raw.get("precio", ""))

            if not articulo and cantidad is None and precio_centavos is None:
                empty_rows += 1
                if empty_rows >= self.args.empty_row_stop_count:
                    break
                pyautogui.press("down")
                continue

            empty_rows = 0
            if signature and signature == last_signature:
                logging.info("Fin de tabla por fila repetida: %s", raw)
                break
            last_signature = signature

            if articulo and cantidad is not None and precio_centavos is not None and cantidad > 0 and precio_centavos > 0:
                products.append(
                    ProductLine(
                        articulo=articulo,
                        cantidad=cantidad,
                        precio_centavos=precio_centavos,
                    )
                )
            else:
                logging.info("Fila omitida por datos incompletos: %s", raw)

            pyautogui.press("down")
        self.emergency_cleanup("after product table")
        return products

    def extract_sale(self, record_number: int) -> ExtractedSale | None:
        self.ensure_foreground(f"record {record_number}")
        header = self.extract_header()
        if header is None:
            return None
        products = self.extract_products()
        total_items = sum(product.subtotal_centavos for product in products)
        difference = total_items - header.total_centavos
        valid = bool(products) and abs(difference) <= self.args.tolerance_centavos
        validation = {
            "valid": valid,
            "itemsTotalCentavos": total_items,
            "headerTotalCentavos": header.total_centavos,
            "differenceCentavos": difference,
            "productCount": len(products),
            "toleranceCentavos": self.args.tolerance_centavos,
        }
        doc_id = build_doc_id(header, products)
        return ExtractedSale(
            record_number=record_number,
            doc_id=doc_id,
            header=header,
            products=products,
            validation=validation,
        )


def upload_sale(db: Any, sale: ExtractedSale, *, overwrite: bool) -> str:
    doc_ref = db.collection("ventas").document(sale.doc_id)
    if doc_ref.get().exists and not overwrite:
        return "skipped_existing"
    doc_ref.set(sale.to_firestore(), merge=overwrite)
    return "uploaded"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migra ventas FileMaker a Firestore via clipboard RPA no intrusivo.")
    parser.add_argument("--window-title", default=DEFAULT_WINDOW_TITLE)
    parser.add_argument("--max-records", type=int, default=20)
    parser.add_argument("--commit", action="store_true", help="Sube a Firestore solo ventas validadas.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--probe", action="store_true", help="Solo activa ventana y guarda screenshot de calibracion.")
    parser.add_argument("--date-order", choices=["mdy", "dmy"], default="mdy")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_LOG_DIR)
    parser.add_argument("--state-db", "--progress-db", dest="state_db", type=Path, default=DEFAULT_STATE_DB)
    parser.add_argument("--start-record", type=int, default=None, help="Numero logico de registro para auditoria.")
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--focus-pause", type=float, default=0.30)
    parser.add_argument("--copy-pause", type=float, default=0.10)
    parser.add_argument("--navigation-pause", type=float, default=0.55)
    parser.add_argument("--tolerance-centavos", type=int, default=0)
    parser.add_argument("--stop-on-repeated-sale", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--next-button-x", type=int, default=1185)
    parser.add_argument("--next-button-y", type=int, default=667)
    parser.add_argument("--previous-button-x", type=int, default=1133)
    parser.add_argument("--previous-button-y", type=int, default=667)
    parser.add_argument("--rewind-records", type=int, default=0, help="Solo retrocede N registros y termina.")
    parser.add_argument("--product-first-row-y", type=int, default=307)
    parser.add_argument("--product-row-height", type=int, default=32)
    parser.add_argument("--visible-product-rows", type=int, default=11)
    parser.add_argument("--max-product-rows", type=int, default=80)
    parser.add_argument("--empty-row-stop-count", type=int, default=2)
    parser.add_argument("--product-articulo-x", type=int, default=281)
    return parser.parse_args()


def save_probe(rpa: ClipboardFileMakerRpa, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"rpa_clipboard_probe_{now_stamp()}.png"
    screenshot = pyautogui.screenshot(
        region=(rpa.geometry.left, rpa.geometry.top, rpa.geometry.width, rpa.geometry.height)
    )
    screenshot.save(path)
    return path


def save_probe_overlay(rpa: ClipboardFileMakerRpa, output_dir: Path) -> Path:
    from PIL import ImageDraw, ImageFont

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"rpa_clipboard_probe_overlay_{now_stamp()}.png"
    image = pyautogui.screenshot(
        region=(rpa.geometry.left, rpa.geometry.top, rpa.geometry.width, rpa.geometry.height)
    )
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()

    points = [
        ("Siguiente", Point(rpa.args.next_button_x, rpa.args.next_button_y)),
        ("Fecha", HEADER_POINTS["fecha"]),
        ("Cliente", HEADER_POINTS["cliente"]),
        ("Total", HEADER_POINTS["total_factura"]),
        ("Producto F1", Point(rpa.args.product_articulo_x, rpa.args.product_first_row_y)),
    ]
    for label, point in points:
        screen_x, screen_y = rpa.scaled_point(point)
        local_x = screen_x - rpa.geometry.left
        local_y = screen_y - rpa.geometry.top
        color = "#E4002B" if label == "Siguiente" else "#111827"
        draw.ellipse((local_x - 8, local_y - 8, local_x + 8, local_y + 8), outline=color, width=4)
        draw.text((local_x + 12, local_y - 12), label, fill=color, font=font)
    image.save(path)
    return path


def run_probe(rpa: ClipboardFileMakerRpa, output_dir: Path, *, move_cursor: bool) -> dict[str, Any]:
    raw_path = save_probe(rpa, output_dir)
    overlay_path = save_probe_overlay(rpa, output_dir)
    probe_points = [
        ("Siguiente Registro", Point(rpa.args.next_button_x, rpa.args.next_button_y)),
        ("Fecha", HEADER_POINTS["fecha"]),
        ("Cliente", HEADER_POINTS["cliente"]),
        ("Total Factura", HEADER_POINTS["total_factura"]),
        ("Primera fila producto", Point(rpa.args.product_articulo_x, rpa.args.product_first_row_y)),
    ]
    positions: list[dict[str, Any]] = []
    for label, point in probe_points:
        screen_x, screen_y = rpa.scaled_point(point)
        if move_cursor:
            pyautogui.moveTo(screen_x, screen_y, duration=0.25)
            time.sleep(0.35)
        current_x, current_y = pyautogui.position()
        positions.append(
            {
                "label": label,
                "design": {"x": point.x, "y": point.y},
                "screen": {"x": screen_x, "y": screen_y},
                "cursor": {"x": current_x, "y": current_y},
            }
        )
    return {
        "rawScreenshot": str(raw_path),
        "overlayScreenshot": str(overlay_path),
        "window": asdict(rpa.geometry),
        "positions": positions,
    }


def main() -> None:
    require_windows_rpa()
    args = parse_args()
    args.output_dir = args.output_dir.resolve()
    args.state_db = args.state_db.resolve()
    log_path = setup_logging(args.output_dir)
    audit_path = args.output_dir / f"rpa_clipboard_extractor_{now_stamp()}.jsonl"
    state = MigrationState(args.state_db)

    logging.info("Log: %s", log_path)
    logging.info("Audit JSONL: %s", audit_path)
    logging.info("SQLite state: %s", args.state_db)
    logging.info("Commit Firestore: %s", args.commit)
    logging.info("Protocolo: click -> Ctrl+A -> Ctrl+C -> paste; sin escritura de texto.")

    rpa = ClipboardFileMakerRpa(args)
    if args.rewind_records:
        rpa.rewind_records(args.rewind_records)
        print(json.dumps({"rewoundRecords": args.rewind_records}, ensure_ascii=False, indent=2))
        return
    if args.probe:
        result = run_probe(rpa, args.output_dir, move_cursor=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    start_record = args.start_record
    if start_record is None:
        start_record = state.last_record_number() + 1 if args.resume else 1

    db = get_firestore_client() if args.commit else None
    processed = 0
    uploaded = 0
    invalid = 0
    errors = 0
    previous_doc_id = ""

    for offset in range(args.max_records):
        record_number = start_record + offset
        try:
            sale = rpa.extract_sale(record_number)
            if sale is None:
                invalid += 1
                write_jsonl(audit_path, {"recordNumber": record_number, "status": "invalid_header"})
                state.mark_cursor(record_number)
                rpa.next_record()
                continue

            if args.stop_on_repeated_sale and sale.doc_id == previous_doc_id:
                logging.warning("Venta repetida detectada; se detiene para evitar bucle: %s", sale.doc_id)
                break
            previous_doc_id = sale.doc_id
            processed += 1

            audit = {
                "recordNumber": record_number,
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
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status="invalid_total",
                    total_centavos=sale.header.total_centavos,
                    error=json.dumps(sale.validation, ensure_ascii=False),
                )
                write_jsonl(audit_path, {"status": "invalid_total", **audit})
                print_sale_summary("INVALID", sale)
                logging.warning("No subido por integridad: %s %s", sale.doc_id, sale.validation)
                rpa.next_record()
                continue

            if state.already_uploaded(sale.doc_id) and not args.overwrite:
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status="skipped_existing",
                    total_centavos=sale.header.total_centavos,
                )
                write_jsonl(audit_path, {"status": "skipped_existing", **audit})
                print_sale_summary("SKIPPED", sale)
                rpa.next_record()
                continue

            if args.commit:
                assert db is not None
                status = upload_sale(db, sale, overwrite=args.overwrite)
                if status == "uploaded":
                    uploaded += 1
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status=status,
                    total_centavos=sale.header.total_centavos,
                )
                write_jsonl(audit_path, {"status": status, **audit})
                print_sale_summary(status.upper(), sale)
            else:
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status="dry_run_valid",
                    total_centavos=sale.header.total_centavos,
                )
                write_jsonl(audit_path, {"status": "dry_run_valid", **audit})
                print_sale_summary("DRY-RUN VALID", sale)

            rpa.next_record()
        except pyautogui.FailSafeException:
            logging.error("FAILSAFE activado. Mouse en esquina; extraccion detenida.")
            break
        except Exception as exc:
            errors += 1
            logging.exception("Error en registro %s", record_number)
            state.mark_cursor(record_number)
            write_jsonl(
                audit_path,
                {
                    "recordNumber": record_number,
                    "status": "error",
                    "error": str(exc),
                },
            )
            try:
                rpa.emergency_cleanup("exception handler")
                rpa.next_record()
            except Exception:
                logging.exception("No se pudo recuperar despues del error.")
                break

    summary = {
        "processed": processed,
        "uploaded": uploaded,
        "invalid": invalid,
        "errors": errors,
        "commit": args.commit,
        "auditPath": str(audit_path),
        "stateDb": str(args.state_db),
        "nextSuggestedRecord": start_record + processed + invalid + errors,
    }
    summary_path = args.output_dir / f"rpa_clipboard_extractor_summary_{now_stamp()}.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**summary, "summaryPath": str(summary_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
