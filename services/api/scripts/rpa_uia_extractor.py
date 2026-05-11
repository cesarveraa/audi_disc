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
from typing import Any, Iterable

try:
    import uiautomation as auto
except ModuleNotFoundError as exc:  # pragma: no cover - exercised by runtime environment
    raise RuntimeError(
        "Falta la libreria uiautomation. Instala dependencias con: "
        "python -m pip install -r services/api/requirements.txt"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client  # noqa: E402


DEFAULT_WINDOW_TITLE = "FMbil_BDD Recovered"
WINDOW_TITLE_FALLBACKS = ("FMbil_BDD Recovered", "FMbil", "Recovered", "FileMaker", ".fmp12")
DEFAULT_LOG_DIR = ROOT / "logs"
DEFAULT_STATE_DB = DEFAULT_LOG_DIR / "migration_uia_state.db"
MIGRATION_USER = "migration:filemaker-uia"

HEADER_FIELD_IDS = {
    "no_comprobante": "Field: Libro_Venta_mes::NumCprobte",
    "fecha": "Field: Libro_Venta_mes::FechaCprobte",
    "cliente": "Field: Libro_Venta_mes::RazonSocialCliente",
    "total": "Field: Libro_Venta_mes::TotalGeneral",
    "total_fallback": "Field: Libro_Venta_mes::SubtotalTotal",
    "hora": "Field: Libro_Venta_mes::hora",
    "metodo": "Field: Libro_Venta_mes::Tipo_venta",
}
PRODUCT_FIELD_IDS = {
    "cantidad": "Field: Entrada_salida::Salida",
    "articulo": "Field: producto::Articulo",
    "precio": "Field: Entrada_salida::PrecioProd",
    "subtotal": "Field: Entrada_salida::Subtotal",
    "precio_compra": "Field: Entrada_salida::CostoProd",
    "utilidad": "Field: Entrada_salida::SubtotalUtilidad",
}
PORTAL_AUTOMATION_ID = "Layout Object: 6644"
PORTAL_SCROLLBAR_AUTOMATION_ID = "View: 6651"
FIRST_BUTTON_AUTOMATION_ID = "Group: 6817"
NEXT_BUTTON_AUTOMATION_ID = "Group: 6829"
PREVIOUS_BUTTON_AUTOMATION_ID = "Group: 6823"


@dataclass(frozen=True)
class RectInfo:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    @classmethod
    def from_uia(cls, rect: Any) -> "RectInfo":
        return cls(left=int(rect.left), top=int(rect.top), right=int(rect.right), bottom=int(rect.bottom))


@dataclass(frozen=True)
class ProductLine:
    articulo: str
    cantidad: int
    precio_centavos: int
    subtotal_centavos: int
    precio_compra_centavos: int | None = None
    utilidad_centavos: int | None = None

    def to_snapshot(self, index: int) -> dict[str, Any]:
        payload = {
            "productoId": f"filemaker-uia-row-{index + 1}",
            "nombre": self.articulo,
            "marca": None,
            "sku": None,
            "categoria": "Migrado FileMaker",
            "cantidad": self.cantidad,
            "precioVentaCentavos": self.precio_centavos,
            "precioVendidoCentavos": self.precio_centavos,
            "subtotalCentavos": self.subtotal_centavos,
        }
        if self.precio_compra_centavos is not None:
            payload["precioCompraCentavos"] = self.precio_compra_centavos
        if self.utilidad_centavos is not None:
            payload["utilidadCentavos"] = self.utilidad_centavos
        return payload


@dataclass(frozen=True)
class SaleHeader:
    no_comprobante: str
    fecha_local: str
    hora_local: str
    cliente: str
    total_centavos: int
    metodo: str
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
            "productos": [line.to_snapshot(index) for index, line in enumerate(self.products)],
            "totalCentavos": self.header.total_centavos,
            "recibidoCentavos": self.header.total_centavos,
            "cambioCentavos": 0,
            "metodo": normalize_payment_method(self.header.metodo),
            "fechaLocal": self.header.fecha_local,
            "horaLocal": self.header.hora_local,
            "estado": True,
            "createdBy": MIGRATION_USER,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "migrated": True,
            "legacy": {
                "source": "FileMaker Pro 12",
                "method": "rpa_uia_extractor",
                "recordNumber": self.record_number,
                "noComprobante": self.header.no_comprobante,
                "cliente": self.header.cliente,
                "rawHeader": self.header.raw,
                "validation": self.validation,
                "migratedAt": datetime.utcnow().isoformat() + "Z",
            },
        }


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def setup_logging(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"rpa_uia_extractor_{now_stamp()}.log"
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


def write_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps({"auditWrittenAt": datetime.now().isoformat(), **payload}, ensure_ascii=False) + "\n")


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
    match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", clean_text(value))
    if not match:
        return None
    first, second, year_text = match.groups()
    year = int(year_text)
    if year < 100:
        year += 2000
    candidates = [(int(first), int(second))] if order == "mdy" else [(int(second), int(first))]
    fallback = (int(second), int(first)) if order == "mdy" else (int(first), int(second))
    candidates.append(fallback)
    for month, day in candidates:
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            continue
    return None


def normalize_payment_method(value: str) -> str:
    text = clean_text(value).casefold()
    if "qr" in text:
        return "Qr"
    if "transfer" in text:
        return "Transferencia"
    return "Efectivo"


def format_centavos(value: int) -> str:
    return f"Bs {value / 100:,.2f}"


def build_doc_id(header: SaleHeader, products: list[ProductLine]) -> str:
    material = {
        "no_comprobante": header.no_comprobante,
        "fecha": header.fecha_local,
        "total": header.total_centavos,
        "products": [asdict(product) for product in products],
    }
    digest = hashlib.sha1(json.dumps(material, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:14]
    comprobante = re.sub(r"[^0-9A-Za-z_-]", "", header.no_comprobante) or "sin_numero"
    return f"filemaker_uia_{comprobante}_{digest}"


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


class UiaFileMakerExtractor:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.window = self.find_window()
        self.window.SetActive()
        time.sleep(args.ui_pause)

    def find_window(self):
        candidates = [self.args.window_title, *WINDOW_TITLE_FALLBACKS]
        for title in candidates:
            if not title:
                continue
            window = auto.WindowControl(searchDepth=1, Name=title)
            if window.Exists(0.7):
                return window

        root = auto.GetRootControl()
        visible = []
        for child in root.GetChildren():
            name = clean_text(child.Name)
            visible.append(name)
            if any(fallback.lower() in name.lower() for fallback in WINDOW_TITLE_FALLBACKS):
                return child
        raise RuntimeError(f"No se encontro ventana FileMaker. Ventanas visibles: {visible[:30]}")

    def refresh_window(self) -> None:
        self.window = self.find_window()
        self.window.SetActive()
        time.sleep(self.args.ui_pause)

    def iter_descendants(self, control: Any | None = None, depth: int = 0, max_depth: int = 8) -> Iterable[Any]:
        control = control or self.window
        if depth > max_depth:
            return
        for child in control.GetChildren():
            yield child
            yield from self.iter_descendants(child, depth + 1, max_depth)

    def control_value(self, control: Any) -> str:
        for getter in (
            lambda: control.GetValuePattern().Value,
            lambda: control.GetLegacyIAccessiblePattern().Value,
            lambda: control.Name,
        ):
            try:
                value = getter()
            except Exception:
                continue
            text = clean_text(value)
            if text:
                return text
        return ""

    def field_controls(self) -> list[Any]:
        return [
            control
            for control in self.iter_descendants(max_depth=8)
            if clean_text(getattr(control, "AutomationId", "")).startswith("Field:")
        ]

    def debug_field_inventory(self) -> list[dict[str, Any]]:
        rows = []
        for control in self.field_controls():
            rect = RectInfo.from_uia(control.BoundingRectangle)
            rows.append(
                {
                    "controlType": control.ControlTypeName,
                    "name": clean_text(control.Name),
                    "automationId": clean_text(control.AutomationId),
                    "className": clean_text(control.ClassName),
                    "rect": asdict(rect),
                    "value": self.control_value(control),
                }
            )
        return rows

    def find_by_automation_id(self, automation_id: str) -> Any | None:
        for control in self.iter_descendants(max_depth=8):
            if clean_text(getattr(control, "AutomationId", "")) == automation_id:
                return control
        return None

    def require_field_value(self, key: str, automation_id: str) -> str:
        control = self.find_by_automation_id(automation_id)
        if control is None:
            inventory = self.debug_field_inventory()
            logging.error("No se encontro campo %s (%s). Inventario UIA: %s", key, automation_id, inventory[:120])
            raise RuntimeError(f"No se encontro campo {key}: {automation_id}")
        return self.control_value(control)

    def extract_header(self) -> SaleHeader:
        raw = {
            "no_comprobante": self.require_field_value("no_comprobante", HEADER_FIELD_IDS["no_comprobante"]),
            "fecha": self.require_field_value("fecha", HEADER_FIELD_IDS["fecha"]),
            "cliente": self.require_field_value("cliente", HEADER_FIELD_IDS["cliente"]),
            "total": self.require_field_value("total", HEADER_FIELD_IDS["total"]),
            "total_fallback": "",
            "hora": self.require_field_value("hora", HEADER_FIELD_IDS["hora"]),
            "metodo": self.require_field_value("metodo", HEADER_FIELD_IDS["metodo"]),
        }
        total_centavos = parse_money_centavos(raw["total"])
        if total_centavos is None:
            raw["total_fallback"] = self.require_field_value("total_fallback", HEADER_FIELD_IDS["total_fallback"])
            total_centavos = parse_money_centavos(raw["total_fallback"])

        fecha_local = parse_filemaker_date(raw["fecha"], self.args.date_order)
        no_comprobante = clean_text(raw["no_comprobante"])
        if not no_comprobante or not fecha_local or total_centavos is None:
            raise RuntimeError(f"Cabecera incompleta: {raw}")

        return SaleHeader(
            no_comprobante=no_comprobante,
            fecha_local=fecha_local,
            hora_local=clean_text(raw["hora"]) or "00:00:00",
            cliente=clean_text(raw["cliente"]) or "Sin Nombre",
            total_centavos=total_centavos,
            metodo=clean_text(raw["metodo"]) or "Efectivo",
            raw=raw,
        )

    def portal_control(self) -> Any | None:
        return self.find_by_automation_id(PORTAL_AUTOMATION_ID)

    def portal_scrollbar(self) -> Any | None:
        return self.find_by_automation_id(PORTAL_SCROLLBAR_AUTOMATION_ID)

    @staticmethod
    def focus_control(control: Any | None) -> None:
        if control is None:
            return
        try:
            control.SetFocus()
        except Exception:
            logging.debug("No se pudo enfocar control UIA antes del scroll.", exc_info=True)

    def row_controls_snapshot(self) -> list[dict[str, Any]]:
        portal = self.portal_control()
        descendants = list(self.iter_descendants(portal, max_depth=4)) if portal is not None else self.field_controls()
        portal_rect = RectInfo.from_uia(portal.BoundingRectangle) if portal is not None else None
        rows: list[dict[str, Any]] = []
        for control in descendants:
            automation_id = clean_text(getattr(control, "AutomationId", ""))
            matching_name = next(
                (field for field, expected_id in PRODUCT_FIELD_IDS.items() if automation_id == expected_id),
                None,
            )
            if matching_name is None:
                continue
            rect = RectInfo.from_uia(control.BoundingRectangle)
            if rect.width <= 0 or rect.height <= 0:
                continue
            if portal_rect is not None and (
                rect.top < portal_rect.top
                or rect.bottom > portal_rect.bottom
                or rect.left < portal_rect.left
                or rect.right > portal_rect.right
            ):
                continue
            center_y = (rect.top + rect.bottom) / 2
            row = next((candidate for candidate in rows if abs(candidate["centerY"] - center_y) <= 14), None)
            if row is None:
                row = {"centerY": center_y, "top": rect.top, "rects": {}, "raw": {}}
                rows.append(row)
            else:
                row["centerY"] = (row["centerY"] + center_y) / 2
                row["top"] = min(row["top"], rect.top)
            row["rects"][matching_name] = asdict(rect)
            row["raw"][matching_name] = self.control_value(control)
        return sorted(rows, key=lambda item: item["top"])

    def collect_visible_products(self) -> list[ProductLine]:
        products: list[ProductLine] = []
        for row in self.row_controls_snapshot():
            raw = row["raw"]
            articulo = clean_text(raw.get("articulo", ""))
            cantidad = parse_integer(raw.get("cantidad", ""))
            precio = parse_money_centavos(raw.get("precio", ""))
            subtotal = parse_money_centavos(raw.get("subtotal", ""))
            precio_compra = parse_money_centavos(raw.get("precio_compra", ""))
            utilidad = parse_money_centavos(raw.get("utilidad", ""))
            if not articulo or cantidad is None or precio is None:
                continue
            if cantidad <= 0 or precio <= 0:
                continue
            if subtotal is None:
                subtotal = cantidad * precio
            products.append(
                ProductLine(
                    articulo=articulo,
                    cantidad=cantidad,
                    precio_centavos=precio,
                    subtotal_centavos=subtotal,
                    precio_compra_centavos=precio_compra,
                    utilidad_centavos=utilidad,
                )
            )
        return products

    def reset_portal_scroll(self) -> None:
        portal = self.portal_control()
        scrollbar = self.portal_scrollbar()
        self.focus_control(portal or scrollbar)
        if portal is not None and self.args.portal_scroll_method == "wheel":
            portal.WheelUp(ratioX=0.5, ratioY=0.5, wheelTimes=max(1, self.args.portal_scroll_reset_clicks), waitTime=0.05)
        elif scrollbar is not None:
            for _ in range(max(0, self.args.portal_scroll_reset_clicks)):
                scrollbar.Click(ratioX=0.5, ratioY=0.03, simulateMove=False, waitTime=0.05)
        time.sleep(self.args.ui_pause)

    def scroll_portal_down(self) -> bool:
        portal = self.portal_control()
        scrollbar = self.portal_scrollbar()
        self.focus_control(portal or scrollbar)
        if portal is not None and self.args.portal_scroll_method == "wheel":
            portal.WheelDown(ratioX=0.5, ratioY=0.5, wheelTimes=1, waitTime=0.05)
        elif scrollbar is not None:
            scrollbar.Click(ratioX=0.5, ratioY=0.97, simulateMove=False, waitTime=0.08)
        else:
            return False
        time.sleep(self.args.ui_pause)
        return True

    @staticmethod
    def product_signature(product: ProductLine) -> tuple[Any, ...]:
        return (
            clean_text(product.articulo).casefold(),
            product.cantidad,
            product.precio_centavos,
            product.subtotal_centavos,
            product.precio_compra_centavos,
            product.utilidad_centavos,
        )

    def merge_product_batch(self, products: list[ProductLine], batch: list[ProductLine]) -> int:
        if not batch:
            return 0
        if not products:
            products.extend(batch)
            return len(batch)

        product_signatures = [self.product_signature(item) for item in products]
        batch_signatures = [self.product_signature(item) for item in batch]
        max_overlap = min(len(product_signatures), len(batch_signatures))
        overlap = 0
        for size in range(max_overlap, 1, -1):
            if product_signatures[-size:] == batch_signatures[:size]:
                overlap = size
                break

        products.extend(batch[overlap:])
        return len(batch) - overlap

    def extract_products(self) -> list[ProductLine]:
        self.reset_portal_scroll()
        products: list[ProductLine] = []
        previous_snapshot = ""
        for _ in range(max(1, self.args.max_portal_scrolls)):
            batch = self.collect_visible_products()
            snapshot = json.dumps([asdict(item) for item in batch], ensure_ascii=False, sort_keys=True)
            if snapshot == previous_snapshot:
                break
            appended = self.merge_product_batch(products, batch)
            if appended == 0:
                break
            previous_snapshot = snapshot
            if not self.scroll_portal_down():
                break
        self.reset_portal_scroll()
        return products

    def next_button(self) -> Any | None:
        button = self.find_by_automation_id(NEXT_BUTTON_AUTOMATION_ID)
        if button is not None:
            return button
        for control in self.iter_descendants(max_depth=6):
            if control.ControlTypeName != "ButtonControl":
                continue
            rect = RectInfo.from_uia(control.BoundingRectangle)
            if 1170 <= rect.left <= 1205 and 650 <= rect.top <= 685:
                return control
        return None

    def previous_button(self) -> Any | None:
        return self.find_by_automation_id(PREVIOUS_BUTTON_AUTOMATION_ID)

    def first_button(self) -> Any | None:
        return self.find_by_automation_id(FIRST_BUTTON_AUTOMATION_ID)

    def invoke_or_click(self, control: Any, label: str) -> None:
        try:
            invoke = control.GetInvokePattern()
            if invoke:
                invoke.Invoke()
            else:
                control.Click(simulateMove=False, waitTime=0.1)
        except Exception:
            logging.debug("InvokePattern fallo para %s; usando Click.", label)
            control.Click(simulateMove=False, waitTime=0.1)

    def click_next_record(self) -> None:
        button = self.next_button()
        if button is None:
            inventory = [
                {
                    "name": clean_text(control.Name),
                    "automationId": clean_text(control.AutomationId),
                    "rect": asdict(RectInfo.from_uia(control.BoundingRectangle)),
                }
                for control in self.iter_descendants(max_depth=6)
                if control.ControlTypeName == "ButtonControl"
            ]
            logging.error("No se encontro boton Siguiente Registro. Botones: %s", inventory)
            raise RuntimeError("No se encontro boton Siguiente Registro")
        self.invoke_or_click(button, "Siguiente Registro")
        time.sleep(self.args.navigation_pause)
        self.refresh_window()

    def click_previous_record(self) -> None:
        button = self.previous_button()
        if button is None:
            raise RuntimeError("No se encontro boton Anterior Registro")
        self.invoke_or_click(button, "Anterior Registro")
        time.sleep(self.args.navigation_pause)
        self.refresh_window()

    def rewind_records(self, count: int) -> None:
        for _ in range(max(0, count)):
            self.click_previous_record()

    def go_first_record(self) -> None:
        button = self.first_button()
        if button is None:
            raise RuntimeError("No se encontro boton Primer Registro")
        self.invoke_or_click(button, "Primer Registro")
        time.sleep(self.args.navigation_pause)
        self.refresh_window()

    def extract_sale(self, record_number: int) -> ExtractedSale:
        self.refresh_window()
        header = self.extract_header()
        products = self.extract_products()
        items_total = sum(product.subtotal_centavos for product in products)
        diff = items_total - header.total_centavos
        validation = {
            "valid": bool(products) and abs(diff) <= self.args.tolerance_centavos,
            "itemsTotalCentavos": items_total,
            "headerTotalCentavos": header.total_centavos,
            "differenceCentavos": diff,
            "productCount": len(products),
            "toleranceCentavos": self.args.tolerance_centavos,
        }
        return ExtractedSale(
            record_number=record_number,
            doc_id=build_doc_id(header, products),
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
    parser = argparse.ArgumentParser(description="Migra ventas FileMaker a Firestore via UI Automation.")
    parser.add_argument("--window-title", default=DEFAULT_WINDOW_TITLE)
    parser.add_argument("--max-records", type=int, default=20)
    parser.add_argument("--commit", action="store_true", help="Sube a Firestore solo ventas validadas.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--inspect", action="store_true", help="Vuelca inventario UIA de campos y termina.")
    parser.add_argument("--date-order", choices=["mdy", "dmy"], default="dmy")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_LOG_DIR)
    parser.add_argument("--state-db", type=Path, default=DEFAULT_STATE_DB)
    parser.add_argument("--start-record", type=int, default=None)
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--ui-pause", type=float, default=0.2)
    parser.add_argument("--navigation-pause", type=float, default=0.45)
    parser.add_argument("--tolerance-centavos", type=int, default=0)
    parser.add_argument("--max-portal-scrolls", type=int, default=8)
    parser.add_argument("--portal-scroll-reset-clicks", type=int, default=20)
    parser.add_argument("--portal-scroll-method", choices=["wheel", "scrollbar"], default="wheel")
    parser.add_argument("--rewind-records", type=int, default=0, help="Solo retrocede N registros y termina.")
    parser.add_argument("--first-record", action="store_true", help="Solo navega al primer registro y termina.")
    parser.add_argument("--compact-progress", action="store_true", help="Imprime una linea por venta y conserva el detalle en JSONL.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir = args.output_dir.resolve()
    args.state_db = args.state_db.resolve()
    log_path = setup_logging(args.output_dir)
    audit_path = args.output_dir / f"rpa_uia_extractor_{now_stamp()}.jsonl"
    state = MigrationState(args.state_db)
    logging.info("Log: %s", log_path)
    logging.info("Audit JSONL: %s", audit_path)
    logging.info("SQLite state: %s", args.state_db)
    logging.info("Commit Firestore: %s", args.commit)

    extractor = UiaFileMakerExtractor(args)
    if args.first_record:
        extractor.go_first_record()
        print(json.dumps({"atFirstRecord": True}, ensure_ascii=False, indent=2))
        return
    if args.rewind_records:
        extractor.rewind_records(args.rewind_records)
        print(json.dumps({"rewoundRecords": args.rewind_records}, ensure_ascii=False, indent=2))
        return
    if args.inspect:
        inspect_path = args.output_dir / f"rpa_uia_inspect_{now_stamp()}.json"
        payload = {
            "window": clean_text(extractor.window.Name),
            "fields": extractor.debug_field_inventory(),
        }
        inspect_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"inspectPath": str(inspect_path), "fieldCount": len(payload["fields"])}, ensure_ascii=False, indent=2))
        return

    start_record = args.start_record
    if start_record is None:
        start_record = state.last_record_number() + 1 if args.resume else 1

    db = get_firestore_client() if args.commit else None
    processed = 0
    uploaded = 0
    invalid = 0
    errors = 0
    processed_total_centavos = 0
    uploaded_total_centavos = 0
    skipped_total_centavos = 0
    invalid_total_centavos = 0
    dry_run_valid_total_centavos = 0
    previous_doc_id = ""

    def emit_status(status: str, sale: ExtractedSale) -> None:
        if args.compact_progress:
            print(
                f"[PROGRESS] {processed}/{args.max_records} | registro={sale.record_number} | "
                f"comp={sale.header.no_comprobante} | status={status} | "
                f"totalCentavos={sale.header.total_centavos} | uploaded={uploaded} | "
                f"invalid={invalid} | errors={errors} | uploadedTotalCentavos={uploaded_total_centavos}"
            )
            return
        print_sale_summary(status, sale)

    for offset in range(args.max_records):
        record_number = start_record + offset
        try:
            sale = extractor.extract_sale(record_number)
            if sale.doc_id == previous_doc_id:
                logging.warning("Venta repetida detectada; se detiene para evitar bucle: %s", sale.doc_id)
                break
            previous_doc_id = sale.doc_id
            processed += 1
            processed_total_centavos += sale.header.total_centavos
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
                invalid_total_centavos += sale.header.total_centavos
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status="invalid_total",
                    total_centavos=sale.header.total_centavos,
                    error=json.dumps(sale.validation, ensure_ascii=False),
                )
                write_jsonl(audit_path, {"status": "invalid_total", **audit})
                emit_status("INVALID", sale)
                extractor.click_next_record()
                continue

            if state.already_uploaded(sale.doc_id) and not args.overwrite:
                skipped_total_centavos += sale.header.total_centavos
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status="skipped_existing",
                    total_centavos=sale.header.total_centavos,
                )
                write_jsonl(audit_path, {"status": "skipped_existing", **audit})
                emit_status("SKIPPED", sale)
                extractor.click_next_record()
                continue

            if args.commit:
                assert db is not None
                status = upload_sale(db, sale, overwrite=args.overwrite)
                if status == "uploaded":
                    uploaded += 1
                    uploaded_total_centavos += sale.header.total_centavos
                elif status == "skipped_existing":
                    skipped_total_centavos += sale.header.total_centavos
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status=status,
                    total_centavos=sale.header.total_centavos,
                )
                write_jsonl(audit_path, {"status": status, **audit})
                emit_status(status.upper(), sale)
            else:
                dry_run_valid_total_centavos += sale.header.total_centavos
                state.mark_sale(
                    doc_id=sale.doc_id,
                    record_number=record_number,
                    no_comprobante=sale.header.no_comprobante,
                    status="dry_run_valid",
                    total_centavos=sale.header.total_centavos,
                )
                write_jsonl(audit_path, {"status": "dry_run_valid", **audit})
                emit_status("DRY-RUN VALID", sale)

            extractor.click_next_record()
        except Exception as exc:
            errors += 1
            logging.exception("Error en registro %s", record_number)
            state.mark_cursor(record_number)
            write_jsonl(audit_path, {"recordNumber": record_number, "status": "error", "error": str(exc)})
            try:
                extractor.click_next_record()
            except Exception:
                logging.exception("No se pudo avanzar despues del error.")
                break

    summary = {
        "processed": processed,
        "uploaded": uploaded,
        "invalid": invalid,
        "errors": errors,
        "commit": args.commit,
        "startRecord": start_record,
        "processedTotalCentavos": processed_total_centavos,
        "uploadedTotalCentavos": uploaded_total_centavos,
        "skippedExistingTotalCentavos": skipped_total_centavos,
        "invalidTotalCentavos": invalid_total_centavos,
        "dryRunValidTotalCentavos": dry_run_valid_total_centavos,
        "auditPath": str(audit_path),
        "stateDb": str(args.state_db),
        "nextSuggestedRecord": start_record + processed + errors,
    }
    summary_path = args.output_dir / f"rpa_uia_extractor_summary_{now_stamp()}.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**summary, "summaryPath": str(summary_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
