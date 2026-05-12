from __future__ import annotations

import argparse
import asyncio
import difflib
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

pyautogui: Any | None = None
pyperclip: Any | None = None
ImageEnhance: Any | None = None
ImageFilter: Any | None = None
ImageOps: Any | None = None
BitmapDecoder: Any | None = None
OcrEngine: Any | None = None
FileAccessMode: Any | None = None
StorageFile: Any | None = None
if sys.platform == "win32":
    try:
        import pyautogui
        import pyperclip
        from PIL import ImageEnhance, ImageFilter, ImageOps
        from winsdk.windows.graphics.imaging import BitmapDecoder
        from winsdk.windows.media.ocr import OcrEngine
        from winsdk.windows.storage import FileAccessMode, StorageFile
    except ModuleNotFoundError:
        pyautogui = None
        pyperclip = None
        ImageEnhance = None
        ImageFilter = None
        ImageOps = None
        BitmapDecoder = None
        OcrEngine = None
        FileAccessMode = None
        StorageFile = None
from google.cloud import firestore


def require_windows_rpa() -> None:
    if sys.platform != "win32":
        raise RuntimeError("La migracion RPA/OCR de FileMaker solo puede ejecutarse en Windows.")
    missing = [
        name
        for name, module in (
            ("pyautogui", pyautogui),
            ("pyperclip", pyperclip),
            ("Pillow", ImageEnhance),
            ("winsdk", OcrEngine),
        )
        if module is None
    ]
    if missing:
        raise RuntimeError(
            "Faltan dependencias RPA/OCR de Windows "
            f"({', '.join(missing)}). Instala con: python -m pip install -r services/api/requirements.txt"
        )

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client  # noqa: E402


if pyautogui is not None:
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.08

DESIGN_WIDTH = 1920
DESIGN_HEIGHT = 1032
DEFAULT_WINDOW_TITLE = "kkkkk"
DEFAULT_LOG_DIR = ROOT / "logs"
DEFAULT_STATE_DB = DEFAULT_LOG_DIR / "rpa_history_migration_state.sqlite3"
AUTOCORRECT_REVIEW_STATUS = "auto_corrected"


def _ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


@dataclass(frozen=True)
class Point:
    x: int
    y: int


@dataclass(frozen=True)
class CellPoint:
    name: str
    x: int
    y: int


@dataclass
class WindowGeometry:
    left: int
    top: int
    width: int
    height: int

    def point(self, x: int, y: int) -> tuple[int, int]:
        scaled_x = self.left + round(x * self.width / DESIGN_WIDTH)
        scaled_y = self.top + round(y * self.height / DESIGN_HEIGHT)
        return scaled_x, scaled_y


@dataclass
class ProductLine:
    cantidad: int
    nombre: str
    precio_venta_centavos: int
    subtotal_centavos: int
    precio_compra_centavos: int
    utilidad_unitaria_centavos: int
    utilidad_centavos: int
    descuento_centavos: int
    total_descuento_centavos: int

    def to_snapshot(self, index: int) -> dict[str, Any]:
        return {
            "productoId": f"filemaker-line-{index + 1}",
            "nombre": self.nombre,
            "marca": None,
            "sku": None,
            "categoria": "Migrado FileMaker",
            "cantidad": self.cantidad,
            "precioVentaCentavos": self.precio_venta_centavos,
            "precioVendidoCentavos": self.precio_venta_centavos,
            "subtotalCentavos": self.subtotal_centavos,
            "precioCompraCentavos": self.precio_compra_centavos,
            "utilidadCentavos": self.utilidad_centavos,
            "legacy": {
                "utilidadUnitariaCentavos": self.utilidad_unitaria_centavos,
                "descuentoCentavos": self.descuento_centavos,
                "totalDescuentoCentavos": self.total_descuento_centavos,
            },
        }


@dataclass(frozen=True)
class ProductMatch:
    id: str
    data: dict[str, Any]
    score: float
    strategy: str


@dataclass(frozen=True)
class UploadResult:
    doc_id: str
    status: str
    uploaded: bool


class SkipCurrentSale(Exception):
    pass


class HumanReviewRequired(RuntimeError):
    pass


def normalize_product_match_name(value: str) -> str:
    text = clean_text(value).casefold()
    replacements = {
        "iod": "100",
        "i0d": "100",
        "ts50d": "ts500",
        "ogb": "8gb",
        "€": "6",
        "â‚¬": "6",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return re.sub(r"[^a-z0-9]+", "", text)


def is_probable_duplicate_product(current: ProductLine, existing: ProductLine) -> bool:
    if current.cantidad != existing.cantidad:
        return False
    if abs(current.precio_venta_centavos - existing.precio_venta_centavos) > 150:
        return False
    if abs(current.subtotal_centavos - existing.subtotal_centavos) > 500:
        return False
    left = normalize_product_match_name(current.nombre)
    right = normalize_product_match_name(existing.nombre)
    if not left or not right:
        return False
    if left in right or right in left:
        return True
    return difflib.SequenceMatcher(None, left, right).ratio() >= 0.68


@dataclass(frozen=True)
class OcrCellBox:
    name: str
    x1: int
    y1: int
    x2: int
    y2: int
    scale: int
    mode: str


FIELD_POINTS = {
    "no_comprobante": Point(704, 153),
    "fecha": Point(704, 174),
    "nit_ci": Point(704, 197),
    "no_autorizacion": Point(704, 221),
    "cliente": Point(246, 242),
    "legacy_venta_label": Point(1166, 72),
    "hora": Point(1286, 120),
    "fecha_introduccion": Point(1115, 181),
    "tipo_comprobante": Point(1266, 181),
    "tipo_movimiento": Point(1115, 226),
    "venta_al": Point(1266, 226),
    "tasa_impuesto": Point(1086, 272),
    "debito_fiscal": Point(1266, 272),
    "monto_recibido": Point(1115, 315),
    "utilidad_total": Point(1266, 315),
    "descuento": Point(1266, 356),
    "codigo_control": Point(1115, 397),
    "cliente_cancelo_con": Point(1266, 397),
    "encargado_venta": Point(1115, 440),
    "vuelto_cliente": Point(1266, 440),
    "total_venta_footer": Point(412, 665),
}

PRODUCT_COLUMNS = [
    CellPoint("cantidad", 42, 307),
    CellPoint("nombre", 281, 307),
    CellPoint("precio_venta", 532, 307),
    CellPoint("subtotal_venta", 612, 307),
    CellPoint("precio_compra", 684, 307),
    CellPoint("utilidad_unitaria", 752, 307),
    CellPoint("utilidad_subtotal", 821, 307),
    CellPoint("descuento", 891, 307),
    CellPoint("total_descuento", 966, 307),
]

PRODUCT_OCR_COLUMNS = [
    OcrCellBox("cantidad", 23, 299, 76, 323, 8, "numeric"),
    OcrCellBox("nombre", 80, 299, 499, 323, 4, "text"),
    OcrCellBox("precio_venta", 500, 299, 578, 323, 8, "numeric"),
    OcrCellBox("subtotal_venta", 579, 299, 654, 323, 8, "numeric"),
    OcrCellBox("precio_compra", 655, 299, 727, 323, 8, "numeric"),
    OcrCellBox("utilidad_unitaria", 728, 299, 793, 323, 8, "numeric"),
    OcrCellBox("utilidad_subtotal", 794, 299, 866, 323, 8, "numeric"),
    OcrCellBox("descuento", 867, 299, 933, 323, 8, "numeric"),
    OcrCellBox("total_descuento", 934, 299, 1000, 323, 8, "numeric"),
]


def setup_logging(log_dir: Path) -> Path:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"rpa_history_migration_{_ts()}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return log_path


async def _recognize_file(path: Path):
    engine = OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        raise RuntimeError("Windows OCR no esta disponible para el perfil actual.")
    file = await StorageFile.get_file_from_path_async(str(path))
    stream = await file.open_async(FileAccessMode.READ)
    decoder = await BitmapDecoder.create_async(stream)
    bitmap = await decoder.get_software_bitmap_async()
    return await engine.recognize_async(bitmap)


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\r", " ").replace("\n", " ")).strip()


def ocr_text_cleanup(value: str) -> str:
    return (
        clean_text(value)
        .replace("SGB", "8GB")
        .replace("TSSOO", "TS500")
        .replace("IOx1S", "10x15")
        .replace("SV", "9V")
    )


def preprocess_for_ocr(image, *, scale: int, mode: str):
    image = ImageOps.grayscale(image)
    image = ImageOps.autocontrast(image, cutoff=1)
    if mode == "numeric":
        image = ImageEnhance.Contrast(image).enhance(2.8)
        image = image.filter(ImageFilter.SHARPEN)
        image = image.point(lambda pixel: 255 if pixel > 165 else 0)
    elif mode == "table":
        image = ImageEnhance.Contrast(image).enhance(2.1)
        image = image.filter(ImageFilter.SHARPEN)
        image = image.point(lambda pixel: 255 if pixel > 175 else 0)
    else:
        image = ImageEnhance.Contrast(image).enhance(1.7)
        image = image.filter(ImageFilter.SHARPEN)
    if scale > 1:
        image = image.resize((image.width * scale, image.height * scale))
    return image


def parse_money_centavos(value: str | None, *, default: int = 0) -> int:
    text = clean_text(value)
    if not text:
        return default
    normalized = (
        text.replace("Bs", "")
        .replace("bs", "")
        .replace(chr(8364), "6")
        .replace("€", "6")
        .replace("O", "0")
        .replace("o", "0")
        .replace("E", "5")
        .replace("e", "5")
        .replace("D", "0")
        .replace("d", "0")
        .replace(")", "0")
        .replace(" ", "")
    )
    normalized = re.sub(r"[^0-9,.-]", "", normalized)
    if not normalized or normalized in {"-", ",", "."}:
        return default
    if "," in normalized and "." in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    elif "," in normalized:
        normalized = normalized.replace(",", ".")
    try:
        amount = Decimal(normalized).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError(f"Monto invalido: {value}") from exc
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def parse_int(value: str | None, *, default: int = 0) -> int:
    text = clean_text(value)
    if not text:
        return default
    normalized = (
        text.replace("O", "0")
        .replace("o", "0")
        .replace("I", "1")
        .replace("l", "1")
    )
    normalized = re.sub(r"[^0-9-]", "", normalized)
    return int(normalized) if normalized else default


def parse_filemaker_date(value: str | None, *, date_order: str) -> str:
    text = clean_text(value)
    if not text:
        return ""
    text = (
        text.replace("t", "2")
        .replace("T", "2")
        .replace("m", "")
        .replace("M", "")
        .replace("l", "1")
        .replace("I", "1")
    )
    date_match = re.search(r"(\d{1,2})\s*[/'.-]\s*(\d{1,2})\s*[/'.-]\s*(\d{4})", text)
    if date_match:
        text = f"{date_match.group(1)}/{date_match.group(2)}/{date_match.group(3)}"
    else:
        digits = re.sub(r"\D", "", text)
        if len(digits) == 7:
            if date_order == "mdy" and 1 <= int(digits[:1]) <= 9 and 1 <= int(digits[1:3]) <= 31:
                text = f"{digits[:1]}/{digits[1:3]}/{digits[3:]}"
            elif date_order == "dmy" and 1 <= int(digits[:2]) <= 31 and 1 <= int(digits[2:3]) <= 9:
                text = f"{digits[:2]}/{digits[2:3]}/{digits[3:]}"
            else:
                year = digits[4:]
                if len(year) == 3 and year.startswith("2"):
                    year = "20" + year[-2:]
                text = f"{digits[:2]}/{digits[2:4]}/{year}"
        elif len(digits) == 8:
            text = f"{digits[:2]}/{digits[2:4]}/{digits[4:]}"
    text = text.replace("-", "/")
    candidates = ["%m/%d/%Y", "%d/%m/%Y"] if date_order == "mdy" else ["%d/%m/%Y", "%m/%d/%Y"]
    candidates.extend(["%Y/%m/%d", "%Y-%m-%d"])
    for fmt in candidates:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Fecha invalida: {value}")


def parse_time(value: str | None) -> str:
    text = clean_text(value)
    if not text:
        return "00:00:00"
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text, fmt).time().replace(microsecond=0).isoformat()
        except ValueError:
            continue
    return text


def map_payment_method(value: str | None) -> str:
    text = clean_text(value).casefold()
    if "qr" in text:
        return "Qr"
    if "transfer" in text or "banco" in text or "deposit" in text:
        return "Transferencia"
    return "Efectivo"


def slug(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return safe[:140] or hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]


def normalize_customer_key(value: str | None) -> str:
    text = clean_text(value).casefold()
    if not text:
        return "sin-nombre"
    replacements = {
        "s/n": "sin nombre",
        "sn": "sin nombre",
        "sin nombre": "sin nombre",
    }
    text = replacements.get(text, text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "sin-nombre"


def normalized_customer_name(value: str | None) -> str:
    text = clean_text(value)
    return text if text else "Sin Nombre"


class MigrationState:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path))
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS migrated_sales (
                doc_id TEXT PRIMARY KEY,
                sequence INTEGER NOT NULL,
                status TEXT NOT NULL,
                total_centavos INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def is_done(self, doc_id: str) -> bool:
        row = self.connection.execute(
            "SELECT status FROM migrated_sales WHERE doc_id = ?",
            (doc_id,),
        ).fetchone()
        return bool(row and row[0] in {"uploaded", "skipped_existing", "skipped_state"})

    def mark(self, doc_id: str, sequence: int, status: str, total_centavos: int, error: str | None = None) -> None:
        self.connection.execute(
            """
            INSERT INTO migrated_sales(doc_id, sequence, status, total_centavos, error, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                sequence = excluded.sequence,
                status = excluded.status,
                total_centavos = excluded.total_centavos,
                error = excluded.error,
                updated_at = excluded.updated_at
            """,
            (doc_id, sequence, status, int(total_centavos), error, datetime.now().isoformat()),
        )
        self.connection.commit()

    def summary(self) -> dict[str, int]:
        uploaded = self.connection.execute(
            "SELECT COUNT(*), COALESCE(SUM(total_centavos), 0) FROM migrated_sales WHERE status = 'uploaded'"
        ).fetchone()
        errors = self.connection.execute(
            "SELECT COUNT(*) FROM migrated_sales WHERE status = 'error'"
        ).fetchone()
        return {
            "uploadedCount": int(uploaded[0] or 0),
            "uploadedTotalCentavos": int(uploaded[1] or 0),
            "errorCount": int(errors[0] or 0),
        }

    def close(self) -> None:
        self.connection.close()


class FirestoreContextResolver:
    def __init__(self, db) -> None:
        self.db = db
        self._products_loaded = False
        self._products_by_norm: dict[str, ProductMatch] = {}
        self._product_candidates: list[ProductMatch] = []
        self._product_cache: dict[str, ProductMatch | None] = {}
        self._customer_cache: dict[str, tuple[str, dict[str, Any]]] = {}

    def _load_products(self) -> None:
        if self._products_loaded:
            return
        logging.info("Cargando indice local de productos Firestore para vincular snapshots...")
        count = 0
        for snapshot in self.db.collection("productos").stream():
            data = snapshot.to_dict() or {}
            if data.get("estado") is False:
                continue
            name = clean_text(data.get("nombre"))
            normalized = normalize_product_match_name(name)
            if not normalized:
                continue
            match = ProductMatch(snapshot.id, data, 1.0, "index")
            self._product_candidates.append(match)
            self._products_by_norm.setdefault(normalized, match)
            sku = clean_text(data.get("sku"))
            if sku:
                self._products_by_norm.setdefault(normalize_product_match_name(sku), match)
            count += 1
        self._products_loaded = True
        logging.info("Indice de productos cargado: %s productos activos.", count)

    def resolve_product(self, item: dict[str, Any]) -> ProductMatch | None:
        self._load_products()
        name = clean_text(item.get("nombre"))
        key = normalize_product_match_name(name)
        if key in self._product_cache:
            return self._product_cache[key]
        exact = self._products_by_norm.get(key)
        if exact:
            result = ProductMatch(exact.id, exact.data, 1.0, "exact_name")
            self._product_cache[key] = result
            return result

        best: ProductMatch | None = None
        for candidate in self._product_candidates:
            candidate_name = normalize_product_match_name(candidate.data.get("nombre"))
            if not candidate_name:
                continue
            if key and (key in candidate_name or candidate_name in key):
                score = min(len(key), len(candidate_name)) / max(len(key), len(candidate_name))
                if score >= 0.62 and (best is None or score > best.score):
                    best = ProductMatch(candidate.id, candidate.data, score, "contains_name")
                continue
            score = difflib.SequenceMatcher(None, key, candidate_name).ratio()
            if score >= 0.74 and (best is None or score > best.score):
                best = ProductMatch(candidate.id, candidate.data, score, "fuzzy_name")

        self._product_cache[key] = best
        return best

    def ensure_customer(self, sale: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        legacy = sale.setdefault("legacy", {})
        raw_name = normalized_customer_name(legacy.get("cliente"))
        key = normalize_customer_key(raw_name)
        if key in self._customer_cache:
            return self._customer_cache[key]

        doc_id = f"filemaker-{slug(key)}"
        doc_ref = self.db.collection("clientes").document(doc_id)
        snapshot = doc_ref.get()
        now = firestore.SERVER_TIMESTAMP
        if snapshot.exists:
            data = snapshot.to_dict() or {}
            customer_snapshot = {
                "id": doc_id,
                "nombre": clean_text(data.get("nombre")) or raw_name,
                "telefono": clean_text(data.get("telefono")) or "0000",
            }
        else:
            payload = {
                "nombre": raw_name,
                "telefono": "0000",
                "estado": True,
                "comprasCount": 0,
                "totalCompradoCentavos": 0,
                "ultimaCompraAt": None,
                "createdAt": now,
                "updatedAt": now,
                "createdBy": "migration:filemaker-rpa",
                "updatedBy": "migration:filemaker-rpa",
                "migration": {
                    "source": "FileMaker",
                    "normalizedKey": key,
                    "nitCi": legacy.get("nitCi"),
                },
            }
            doc_ref.set(payload, merge=True)
            customer_snapshot = {"id": doc_id, "nombre": raw_name, "telefono": "0000"}
            logging.info("Cliente migrado/creado: %s (%s)", raw_name, doc_id)

        self._customer_cache[key] = (doc_id, customer_snapshot)
        return doc_id, customer_snapshot

    def enrich_sale(self, sale: dict[str, Any]) -> dict[str, Any]:
        customer_id, customer_snapshot = self.ensure_customer(sale)
        sale["clienteId"] = customer_id
        sale["clienteSnapshot"] = customer_snapshot

        unmatched: list[str] = []
        for item in sale.get("productos", []):
            match = self.resolve_product(item)
            legacy = item.setdefault("legacy", {})
            if not match:
                legacy["productMatch"] = {"status": "unmatched"}
                unmatched.append(clean_text(item.get("nombre")))
                continue
            product = match.data
            item["productoId"] = match.id
            item["marca"] = product.get("marca")
            item["sku"] = product.get("sku")
            item["categoria"] = product.get("categoria") or item.get("categoria")
            if int(item.get("precioCompraCentavos", 0)) <= 0:
                item["precioCompraCentavos"] = int(product.get("precioCompraCentavos", 0) or 0)
            quantity = int(item.get("cantidad", 0))
            sold_price = int(item.get("precioVendidoCentavos", item.get("precioVentaCentavos", 0)))
            purchase_price = int(item.get("precioCompraCentavos", 0))
            item["utilidadCentavos"] = (sold_price - purchase_price) * quantity
            legacy["productMatch"] = {
                "status": "matched",
                "score": round(match.score, 4),
                "strategy": match.strategy,
                "matchedNombre": product.get("nombre"),
            }

        sale.setdefault("legacy", {})["unmatchedProducts"] = unmatched
        return sale


class FileMakerRpa:
    def __init__(self, args: argparse.Namespace, output_dir: Path) -> None:
        require_windows_rpa()
        self.args = args
        self.output_dir = output_dir
        self.geometry = self._find_window(args.window_title)
        self.current_list_context: dict[str, str] = {}

    def _find_window(self, title: str) -> WindowGeometry:
        windows = pyautogui.getWindowsWithTitle(title)
        if not windows:
            raise RuntimeError(f"No encontre una ventana con titulo que contenga: {title}")
        window = windows[0]
        activation_error: Exception | None = None
        try:
            if getattr(window, "isMinimized", False):
                window.restore()
                time.sleep(0.4)
            window.activate()
            time.sleep(0.4)
            if window.left < -1000 or window.top < -1000 or window.width < 400 or window.height < 300:
                window.restore()
                time.sleep(0.3)
            if window.width < 1200 or window.height < 700:
                window.maximize()
                time.sleep(0.4)
        except Exception as exc:
            activation_error = exc
        if activation_error is not None:
            raise RuntimeError(
                f"No se pudo activar la ventana '{title}'. Trae FileMaker al frente y vuelve a ejecutar."
            ) from activation_error
        if window.left < -1000 or window.top < -1000 or window.width < 400 or window.height < 300:
            raise RuntimeError(
                f"La ventana '{title}' no esta visible o esta minimizada: "
                f"left={window.left}, top={window.top}, width={window.width}, height={window.height}."
            )
        return WindowGeometry(left=window.left, top=window.top, width=window.width, height=window.height)

    def click(self, x: int, y: int, clicks: int = 1) -> None:
        px, py = self.geometry.point(x, y)
        pyautogui.click(px, py, clicks=clicks)

    def wait_stable(self, timeout: float = 4.0) -> None:
        time.sleep(self.args.ui_pause)
        start = time.time()
        previous_hash = None
        stable_ticks = 0
        while time.time() - start < timeout:
            screenshot = pyautogui.screenshot(region=(
                self.geometry.left,
                self.geometry.top,
                min(self.geometry.width, 1360),
                min(self.geometry.height, 740),
            ))
            digest = hashlib.sha1(screenshot.tobytes()).hexdigest()
            if digest == previous_hash:
                stable_ticks += 1
                if stable_ticks >= 2:
                    return
            else:
                stable_ticks = 0
            previous_hash = digest
            time.sleep(0.25)

    def probe(self) -> Path:
        screenshot_path = self.output_dir / f"filemaker_probe_{_ts()}.png"
        screenshot = pyautogui.screenshot(region=(
            self.geometry.left,
            self.geometry.top,
            self.geometry.width,
            self.geometry.height,
        ))
        screenshot.save(screenshot_path)
        logging.info("Ventana detectada en %s", self.geometry)
        logging.info("Screenshot probe guardado en %s", screenshot_path)
        return screenshot_path

    def screenshot_region(self, x1: int, y1: int, x2: int, y2: int):
        left, top = self.geometry.point(x1, y1)
        right, bottom = self.geometry.point(x2, y2)
        return pyautogui.screenshot(region=(left, top, max(1, right - left), max(1, bottom - top)))

    def ocr_region(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        *,
        scale: int = 2,
        mode: str = "text",
        keep_debug: bool = False,
    ) -> list[dict[str, Any]]:
        image = self.screenshot_region(x1, y1, x2, y2)
        image = preprocess_for_ocr(image, scale=scale, mode=mode)
        tmp_path = self.output_dir / f"ocr_tmp_{time.time_ns()}.png"
        image.save(tmp_path)
        try:
            result = asyncio.run(_recognize_file(tmp_path))
            words: list[dict[str, Any]] = []
            for line in result.lines:
                words.append({"text": clean_text(line.text), "line": True})
                for word in line.words:
                    words.append(
                        {
                            "text": clean_text(word.text),
                            "line": False,
                            "x": float(word.bounding_rect.x),
                            "y": float(word.bounding_rect.y),
                            "w": float(word.bounding_rect.width),
                            "h": float(word.bounding_rect.height),
                        }
                    )
            return words
        finally:
            if not keep_debug:
                tmp_path.unlink(missing_ok=True)

    def ocr_lines(self, x1: int, y1: int, x2: int, y2: int, *, scale: int = 3, mode: str = "text") -> list[str]:
        return [
            word["text"]
            for word in self.ocr_region(x1, y1, x2, y2, scale=scale, mode=mode)
            if word.get("line") and word.get("text")
        ]

    def ocr_cell_text(self, x1: int, y1: int, x2: int, y2: int, *, scale: int, mode: str) -> str:
        lines = self.ocr_lines(x1, y1, x2, y2, scale=scale, mode=mode)
        return clean_text(" ".join(lines))

    def copy_at(self, point: Point | CellPoint, *, select_all: bool = True) -> str:
        x, y = (point.x, point.y)
        self.click(x, y)
        time.sleep(0.05)
        pyperclip.copy("")
        if select_all:
            pyautogui.hotkey("ctrl", "a")
            time.sleep(0.04)
        pyautogui.hotkey("ctrl", "c")
        time.sleep(self.args.copy_pause)
        return clean_text(pyperclip.paste())

    def enter_detail_from_list(self, row_index: int) -> None:
        self.current_list_context = self.extract_list_row_context(row_index)
        logging.info("Contexto fila lista: %s", self.current_list_context)
        y = self.args.list_first_row_y + row_index * self.args.list_row_height
        self.click(self.args.list_triangle_x, y)
        self.wait_stable()

    def extract_list_row_context(self, row_index: int) -> dict[str, str]:
        y = self.args.list_first_row_y + row_index * self.args.list_row_height
        lines = self.ocr_lines(8, y - 8, 1140, y + 8, scale=8)
        joined = " ".join(lines)
        date_match = re.search(r"\d{1,2}\s*/\s*\d{3,6}", joined)
        venta_match = re.search(r"\bv\s*(\d+)\b", joined, flags=re.IGNORECASE)
        return {
            "raw": joined,
            "fecha": date_match.group(0).replace(" ", "") if date_match else "",
            "legacy_venta_label": f"v{venta_match.group(1)}" if venta_match else "",
            "no_comprobante": venta_match.group(1) if venta_match else "",
        }

    def next_detail_record(self) -> None:
        self.click(self.args.next_button_x, self.args.next_button_y)
        self.wait_stable()

    def reset_product_scroll(self) -> None:
        up_x, up_y = self.geometry.point(self.args.product_scrollbar_x, self.args.product_scrollbar_top_y)
        for _ in range(self.args.product_scroll_reset_clicks):
            pyautogui.click(up_x, up_y)
        time.sleep(0.2)

    def scroll_products_down(self) -> None:
        down_x, down_y = self.geometry.point(self.args.product_scrollbar_x, self.args.product_scrollbar_bottom_y)
        for _ in range(self.args.product_scroll_page_clicks):
            pyautogui.click(down_x, down_y)
        if self.args.product_scroll_wheel_clicks > 0:
            wheel_x, wheel_y = self.geometry.point(self.args.product_scroll_x, self.args.product_scroll_y)
            pyautogui.moveTo(wheel_x, wheel_y)
            pyautogui.scroll(-self.args.product_scroll_wheel_clicks)
        if self.args.product_scroll_pagedown:
            table_x, table_y = self.geometry.point(520, 610)
            pyautogui.click(table_x, table_y)
            pyautogui.press("pagedown")
        time.sleep(0.25)

    def extract_header(self) -> dict[str, str]:
        if self.args.ocr_fallback and not self.args.clipboard_fallback:
            return self.extract_header_ocr()

        fields = {}
        for name, point in FIELD_POINTS.items():
            try:
                fields[name] = self.copy_at(point)
            except Exception as exc:
                logging.warning("No se pudo copiar campo %s: %s", name, exc)
                fields[name] = ""
        if self.args.ocr_fallback:
            ocr_fields = self.extract_header_ocr()
            for key, value in ocr_fields.items():
                current = fields.get(key, "")
                if value and (not current or len(current) > 40 or "\n" in current):
                    fields[key] = value
        return fields

    def _line_after(self, lines: list[str], keyword: str) -> str:
        normalized_keyword = keyword.casefold()
        for index, line in enumerate(lines):
            if normalized_keyword in line.casefold():
                for candidate in lines[index + 1:index + 4]:
                    if candidate and keyword.casefold() not in candidate.casefold():
                        return candidate
        return ""

    def extract_header_ocr(self) -> dict[str, str]:
        sale_label_lines = self.ocr_lines(1045, 58, 1295, 86, scale=6, mode="text")
        right_lines = self.ocr_lines(1040, 58, 1330, 455, scale=4, mode="table")
        left_lines = self.ocr_lines(60, 136, 790, 680, scale=3, mode="text")
        total_lines = self.ocr_lines(360, 650, 470, 680, scale=7, mode="numeric")
        all_lines = right_lines + left_lines
        joined = "\n".join(all_lines)
        right_joined = "\n".join(sale_label_lines + right_lines)

        sale_match = (
            re.search(r"\bv\s*[:\-]?\s*(\d+)\b", right_joined, flags=re.IGNORECASE)
            or re.search(r"N[O0]\s*[:\-]?\s*v?\s*(\d+)", right_joined, flags=re.IGNORECASE)
        )
        form_date_lines = self.ocr_lines(625, 165, 790, 190, scale=8, mode="numeric")
        date_lines = self.ocr_lines(1040, 165, 1200, 195, scale=8, mode="numeric")
        date_value = next((line for line in form_date_lines + date_lines if re.search(r"\d", line)), "")
        date_match = re.search(r"\d{1,2}\s*[/'.-]\s*\d{1,2}\s*[/'.-]\s*\d{4}", date_value)
        time_match = re.search(r"\d{1,2}:\d{2}(?::\d{2})?", joined)
        cliente = ""
        for line in all_lines:
            if "sin nombre" in line.casefold():
                cliente = "Sin Nombre"
                break

        venta_al = next((line for line in all_lines if "contado" in line.casefold()), "")
        tipo_comprobante = next((line for line in all_lines if "entrega" in line.casefold()), "")
        tipo_movimiento = next((line for line in all_lines if "mercader" in line.casefold()), "")

        return {
            "legacy_venta_label": f"v{sale_match.group(1)}" if sale_match else "",
            "no_comprobante": sale_match.group(1) if sale_match else "",
            "fecha": date_match.group(0).replace("'", "/") if date_match else date_value,
            "fecha_introduccion": date_match.group(0).replace("'", "/") if date_match else date_value,
            "hora": time_match.group(0) if time_match else "",
            "cliente": cliente,
            "tipo_comprobante": tipo_comprobante,
            "tipo_movimiento": tipo_movimiento,
            "venta_al": venta_al,
            "monto_recibido": self._line_after(right_lines, "Monto"),
            "utilidad_total": self._line_after(right_lines, "Util"),
            "debito_fiscal": self._line_after(right_lines, "Debito"),
            "descuento": self._line_after(right_lines, "Descuento"),
            "encargado_venta": self._line_after(right_lines, "Encarg"),
            "total_venta_footer": next((line for line in total_lines if re.search(r"\d", line)), ""),
        }

    def extract_product_row(self, row_offset: int) -> ProductLine | None:
        row_values: dict[str, str] = {}
        for column in PRODUCT_COLUMNS:
            point = CellPoint(column.name, column.x, column.y + row_offset * self.args.product_row_height)
            row_values[column.name] = self.copy_at(point)

        nombre = clean_text(row_values.get("nombre"))
        if not nombre:
            return None
        cantidad = parse_int(row_values.get("cantidad"))
        precio_venta = parse_money_centavos(row_values.get("precio_venta"))
        subtotal = parse_money_centavos(row_values.get("subtotal_venta"))
        precio_compra = parse_money_centavos(row_values.get("precio_compra"))
        utilidad_unitaria = parse_money_centavos(row_values.get("utilidad_unitaria"))
        utilidad_subtotal = parse_money_centavos(row_values.get("utilidad_subtotal"))
        descuento = parse_money_centavos(row_values.get("descuento"))
        total_descuento = parse_money_centavos(row_values.get("total_descuento"))
        if subtotal <= 0 and precio_venta > 0 and cantidad > 0:
            subtotal = precio_venta * cantidad
        if utilidad_subtotal == 0 and utilidad_unitaria and cantidad:
            utilidad_subtotal = utilidad_unitaria * cantidad
        return ProductLine(
            cantidad=cantidad,
            nombre=nombre,
            precio_venta_centavos=precio_venta,
            subtotal_centavos=subtotal,
            precio_compra_centavos=precio_compra,
            utilidad_unitaria_centavos=utilidad_unitaria,
            utilidad_centavos=utilidad_subtotal,
            descuento_centavos=descuento,
            total_descuento_centavos=total_descuento,
        )

    def extract_products(self) -> list[ProductLine]:
        if self.args.ocr_fallback:
            return self.extract_products_ocr()
        self.reset_product_scroll()
        products: list[ProductLine] = []
        seen: set[tuple[int, str, int, int]] = set()
        previous_page_signature: tuple[tuple[int, str, int, int], ...] | None = None

        for page in range(self.args.max_product_scrolls):
            page_rows: list[ProductLine] = []
            for row_offset in range(self.args.visible_product_rows):
                try:
                    product = self.extract_product_row(row_offset)
                except Exception as exc:
                    logging.warning("Fila producto no capturada pagina=%s fila=%s: %s", page, row_offset, exc)
                    continue
                if product is None:
                    continue
                signature = (
                    product.cantidad,
                    product.nombre,
                    product.precio_venta_centavos,
                    product.subtotal_centavos,
                )
                if signature not in seen:
                    page_rows.append(product)
                    seen.add(signature)

            page_signature = tuple(
                (line.cantidad, line.nombre, line.precio_venta_centavos, line.subtotal_centavos)
                for line in page_rows
            )
            if not page_rows:
                break
            if previous_page_signature == page_signature:
                break
            products.extend(page_rows)
            previous_page_signature = page_signature
            if len(page_rows) < self.args.visible_product_rows:
                break
            self.scroll_products_down()

        return products

    def extract_product_row_full_ocr(self, row_index: int) -> dict[str, Any]:
        y1 = 292 + row_index * self.args.product_row_height
        y2 = 322 + row_index * self.args.product_row_height
        lines = self.ocr_lines(15, y1, 1005, y2, scale=5, mode="text")
        joined = clean_text(" ".join(lines))
        if not joined:
            return {}

        quantity = 0
        money_pattern = r"[0-9OolIDd\)&â‚¬.,]{1,12}[,.][0-9OolIDd\)&â‚¬.,]{1,6}"
        first_money = re.search(money_pattern, joined)
        prefix = joined[: first_money.start()] if first_money else joined
        leading_quantity = re.match(r"^\s*([0-9OolISs]{1,4})\b", prefix)
        if leading_quantity:
            raw_quantity = leading_quantity.group(1)
            quantity = 5 if raw_quantity in {"s", "S"} else parse_int(raw_quantity)
        if quantity <= 0:
            integer_candidates = re.findall(r"\b([0-9OolI]{1,4})\b", prefix)
            if integer_candidates:
                candidate_quantity = parse_int(integer_candidates[-1])
                if candidate_quantity >= 10:
                    quantity = candidate_quantity

        name_area = prefix
        if leading_quantity:
            name_area = prefix[leading_quantity.end():]
        elif quantity > 0 and str(quantity) in name_area:
            name_area = re.sub(rf"\b{quantity}\b", "", name_area, count=1)
        fallback_name = clean_text(name_area)

        numeric_area = joined
        unit_match = re.search(r"\bPza\.?", joined, flags=re.IGNORECASE)
        if unit_match:
            numeric_area = joined[unit_match.end():]
        money_tokens = re.findall(money_pattern, numeric_area)
        money_values: list[int] = []
        for token in money_tokens:
            try:
                value = parse_money_centavos(token)
            except ValueError:
                continue
            money_values.append(value)

        return {
            "raw": joined,
            "nombre": fallback_name,
            "cantidad": quantity,
            "precio_venta": money_values[0] if len(money_values) > 0 else 0,
            "subtotal_venta": money_values[1] if len(money_values) > 1 else 0,
            "precio_compra": money_values[2] if len(money_values) > 2 else 0,
            "utilidad_unitaria": money_values[3] if len(money_values) > 3 else 0,
            "utilidad_subtotal": money_values[4] if len(money_values) > 4 else 0,
        }

    def extract_products_ocr_page(self) -> list[ProductLine]:
        products: list[ProductLine] = []
        for row_index in range(self.args.visible_product_rows):
            y_delta = row_index * self.args.product_row_height
            row_values: dict[str, str] = {}
            for column in PRODUCT_OCR_COLUMNS:
                row_values[column.name] = self.ocr_cell_text(
                    column.x1,
                    column.y1 + y_delta,
                    column.x2,
                    column.y2 + y_delta,
                    scale=column.scale,
                    mode=column.mode,
                )

            fallback: dict[str, Any] = {}
            nombre = ocr_text_cleanup(row_values.get("nombre", ""))
            if not nombre:
                fallback = self.extract_product_row_full_ocr(row_index)
                nombre = ocr_text_cleanup(str(fallback.get("nombre", "")))
                if not nombre:
                    continue
            precio_venta = parse_money_centavos(row_values.get("precio_venta"))
            subtotal = parse_money_centavos(row_values.get("subtotal_venta"))
            precio_compra = parse_money_centavos(row_values.get("precio_compra"))
            utilidad_unitaria = parse_money_centavos(row_values.get("utilidad_unitaria"))
            utilidad_subtotal = parse_money_centavos(row_values.get("utilidad_subtotal"))
            descuento = parse_money_centavos(row_values.get("descuento"))
            total_descuento = parse_money_centavos(row_values.get("total_descuento"))
            cantidad = parse_int(row_values.get("cantidad"))
            precio_venta = snap_product_sale_money(precio_venta)
            subtotal = snap_product_sale_money(subtotal)
            needs_fallback = (
                cantidad <= 0
                or precio_venta <= 0
                or subtotal <= 0
                or (precio_compra <= 0 and utilidad_unitaria <= 0)
            )
            if needs_fallback:
                if not fallback:
                    fallback = self.extract_product_row_full_ocr(row_index)
                if cantidad <= 0 and fallback.get("cantidad", 0) > 0:
                    cantidad = int(fallback["cantidad"])
                if precio_venta <= 0 and fallback.get("precio_venta", 0) > 0:
                    precio_venta = snap_product_sale_money(int(fallback["precio_venta"]))
                if subtotal <= 0 and fallback.get("subtotal_venta", 0) > 0:
                    subtotal = snap_product_sale_money(int(fallback["subtotal_venta"]))
                if precio_compra <= 0 and fallback.get("precio_compra", 0) > 0:
                    precio_compra = int(fallback["precio_compra"])
                if utilidad_unitaria <= 0 and fallback.get("utilidad_unitaria", 0) > 0:
                    utilidad_unitaria = int(fallback["utilidad_unitaria"])
                if utilidad_subtotal <= 0 and fallback.get("utilidad_subtotal", 0) > 0:
                    utilidad_subtotal = int(fallback["utilidad_subtotal"])
            if cantidad <= 0 and precio_venta > 0 and subtotal > 0:
                estimated = Decimal(subtotal) / Decimal(precio_venta)
                cantidad = max(1, int(estimated.to_integral_value(rounding=ROUND_HALF_UP)))
            inferred_price = precio_compra + utilidad_unitaria
            if inferred_price > 0 and (
                precio_venta <= 0
                or abs(precio_venta - inferred_price) <= max(500, int(max(precio_venta, inferred_price) * 0.08))
            ):
                precio_venta = inferred_price
            if precio_venta > 0 and cantidad > 0:
                subtotal = precio_venta * cantidad
            if utilidad_subtotal == 0 and utilidad_unitaria > 0 and cantidad > 0:
                utilidad_subtotal = utilidad_unitaria * cantidad

            products.append(
                ProductLine(
                    cantidad=cantidad,
                    nombre=nombre,
                    precio_venta_centavos=precio_venta,
                    subtotal_centavos=subtotal,
                    precio_compra_centavos=precio_compra,
                    utilidad_unitaria_centavos=utilidad_unitaria,
                    utilidad_centavos=utilidad_subtotal,
                    descuento_centavos=descuento,
                    total_descuento_centavos=total_descuento,
                )
            )
        return products

    def extract_products_ocr(self) -> list[ProductLine]:
        self.reset_product_scroll()
        products: list[ProductLine] = []
        seen: set[tuple[int, str, int, int]] = set()
        previous_first_signature: tuple[int, str, int, int] | None = None

        for page in range(self.args.max_product_scrolls):
            page_rows = self.extract_products_ocr_page()
            if not page_rows:
                break
            first = (
                page_rows[0].cantidad,
                page_rows[0].nombre,
                page_rows[0].precio_venta_centavos,
                page_rows[0].subtotal_centavos,
            )
            if first == previous_first_signature:
                break
            previous_first_signature = first
            for product in page_rows:
                signature = (
                    product.cantidad,
                    product.nombre,
                    product.precio_venta_centavos,
                    product.subtotal_centavos,
                )
                if signature in seen:
                    continue
                if any(is_probable_duplicate_product(product, existing) for existing in products):
                    continue
                seen.add(signature)
                products.append(product)
            if len(page_rows) < self.args.visible_product_rows:
                break
            self.scroll_products_down()
        return products

    def normalize_sale(self, header: dict[str, str], products: list[ProductLine], sequence: int) -> dict[str, Any]:
        list_context = self.current_list_context or {}
        comprobante = (
            clean_text(header.get("no_comprobante"))
            or clean_text(list_context.get("no_comprobante"))
            or clean_text(header.get("legacy_venta_label"))
            or clean_text(list_context.get("legacy_venta_label"))
        )
        fecha_raw = list_context.get("fecha") or header.get("fecha") or header.get("fecha_introduccion")
        try:
            fecha_local = parse_filemaker_date(fecha_raw, date_order=self.args.date_order)
            date_warning = None
        except ValueError as exc:
            logging.warning("Fecha OCR invalida en venta %s: %s", comprobante, exc)
            fecha_local = ""
            date_warning = {
                "code": "invalid_date",
                "rawFecha": fecha_raw,
                "message": str(exc),
            }
        hora_local = parse_time(header.get("hora"))
        total_field = parse_money_centavos(header.get("total_venta_footer"))
        received = parse_money_centavos(header.get("monto_recibido"), default=total_field)
        change = parse_money_centavos(header.get("vuelto_cliente"), default=max(0, received - total_field))
        product_total = sum(product.subtotal_centavos for product in products)
        total = total_field or product_total
        utility = parse_money_centavos(header.get("utilidad_total"), default=sum(product.utilidad_centavos for product in products))

        if product_total and total and abs(product_total - total) > self.args.total_tolerance_centavos:
            logging.warning(
                "Total diferente en venta %s: campo=%s productos=%s",
                comprobante,
                total,
                product_total,
            )
        quality_warnings = []
        if product_total and total and abs(product_total - total) > self.args.total_tolerance_centavos:
            quality_warnings.append(
                {
                    "code": "total_mismatch",
                    "totalCentavos": total,
                    "productTotalCentavos": product_total,
                }
            )
        if date_warning:
            quality_warnings.append(date_warning)

        return {
            "productos": [product.to_snapshot(index) for index, product in enumerate(products)],
            "totalCentavos": total,
            "recibidoCentavos": received,
            "cambioCentavos": change,
            "metodo": map_payment_method(header.get("venta_al")),
            "fechaLocal": fecha_local,
            "horaLocal": hora_local,
            "estado": True,
            "createdBy": "migration:filemaker-rpa",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "legacy": {
                "source": "FileMaker",
                "sequence": sequence,
                "ventaId": comprobante,
                "rawVentaLabel": header.get("legacy_venta_label"),
                "cliente": header.get("cliente"),
                "nitCi": header.get("nit_ci"),
                "noAutorizacion": header.get("no_autorizacion"),
                "tipoComprobante": header.get("tipo_comprobante"),
                "tipoMovimiento": header.get("tipo_movimiento"),
                "ventaAl": header.get("venta_al"),
                "rawFecha": fecha_raw,
                "tasaImpuesto": header.get("tasa_impuesto"),
                "debitoFiscalCentavos": parse_money_centavos(header.get("debito_fiscal")),
                "utilidadTotalCentavos": utility,
                "descuentoCentavos": parse_money_centavos(header.get("descuento")),
                "codigoControl": header.get("codigo_control"),
                "clienteCanceloConCentavos": parse_money_centavos(header.get("cliente_cancelo_con")),
                "encargadoVenta": header.get("encargado_venta"),
                "extractedAt": datetime.now().isoformat(),
                "listContext": list_context,
                "qualityWarnings": quality_warnings,
            },
        }

    def extract_current_sale(self, sequence: int) -> dict[str, Any]:
        header = self.extract_header()
        products = self.extract_products()
        if not products:
            raise RuntimeError("No se capturaron productos para la venta actual")
        sale = self.normalize_sale(header, products, sequence=sequence)
        return sale


def sale_doc_id(sale: dict[str, Any]) -> str:
    legacy = sale.get("legacy", {})
    key = clean_text(str(legacy.get("ventaId") or legacy.get("rawVentaLabel") or legacy.get("sequence")))
    return f"filemaker-{slug(key)}"


def sale_product_total(sale: dict[str, Any]) -> int:
    return sum(int(item.get("subtotalCentavos", 0)) for item in sale.get("productos", []))


def refresh_sale_totals(sale: dict[str, Any]) -> None:
    for item in sale.get("productos", []):
        quantity = int(item.get("cantidad", 0))
        price = int(item.get("precioVendidoCentavos", item.get("precioVentaCentavos", 0)))
        subtotal = int(item.get("subtotalCentavos", 0))
        if subtotal <= 0 and quantity > 0 and price > 0:
            subtotal = quantity * price
            item["subtotalCentavos"] = subtotal
        item["precioVentaCentavos"] = price
        item["precioVendidoCentavos"] = price
        purchase = int(item.get("precioCompraCentavos", 0))
        item["utilidadCentavos"] = (price - purchase) * quantity


def recompute_quality_warnings(sale: dict[str, Any], tolerance: int) -> list[dict[str, Any]]:
    refresh_sale_totals(sale)
    total = int(sale.get("totalCentavos", 0))
    product_total = sale_product_total(sale)
    warnings: list[dict[str, Any]] = []
    fecha_local = clean_text(str(sale.get("fechaLocal", "")))
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha_local):
        warnings.append(
            {
                "code": "invalid_date",
                "fechaLocal": fecha_local,
                "rawFecha": sale.get("legacy", {}).get("rawFecha"),
            }
        )
    if total and product_total and abs(total - product_total) > tolerance:
        warnings.append(
            {
                "code": "total_mismatch",
                "totalCentavos": total,
                "productTotalCentavos": product_total,
                "differenceCentavos": total - product_total,
            }
        )
    sale.setdefault("legacy", {})["qualityWarnings"] = warnings
    return warnings


def _is_valid_sale_date(sale: dict[str, Any]) -> bool:
    fecha_local = clean_text(str(sale.get("fechaLocal", "")))
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha_local))


def auto_correct_minor_mismatch(sale: dict[str, Any], *, tolerance: int, max_ratio: float) -> bool:
    refresh_sale_totals(sale)
    if not _is_valid_sale_date(sale):
        return False
    total = int(sale.get("totalCentavos", 0))
    product_total = sale_product_total(sale)
    if total <= 0 or product_total <= 0:
        return False
    difference = total - product_total
    if abs(difference) <= tolerance:
        return False
    ratio = abs(difference) / max(1, abs(total))
    if ratio > max_ratio:
        return False
    products = sale.get("productos", [])
    if not products:
        return False

    target_index, target_item = max(
        enumerate(products),
        key=lambda indexed: int(indexed[1].get("subtotalCentavos", 0)),
    )
    old_subtotal = int(target_item.get("subtotalCentavos", 0))
    new_subtotal = max(0, old_subtotal + difference)
    target_item["subtotalCentavos"] = new_subtotal
    quantity = int(target_item.get("cantidad", 0))
    if quantity > 0:
        adjusted_price = int((Decimal(new_subtotal) / Decimal(quantity)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        target_item["precioVendidoCentavos"] = adjusted_price
        target_item["precioVentaCentavos"] = adjusted_price
    sold_price = int(target_item.get("precioVendidoCentavos", target_item.get("precioVentaCentavos", 0)))
    purchase = int(target_item.get("precioCompraCentavos", 0))
    target_item["utilidadCentavos"] = (sold_price - purchase) * quantity

    legacy = sale.setdefault("legacy", {})
    legacy.setdefault("autoCorrections", []).append(
        {
            "type": "minor_total_mismatch",
            "differenceCentavos": difference,
            "ratio": round(ratio, 6),
            "targetProductIndex": target_index + 1,
            "targetProduct": target_item.get("nombre"),
            "oldSubtotalCentavos": old_subtotal,
            "newSubtotalCentavos": new_subtotal,
            "source": "header_total",
        }
    )
    legacy["reviewStatus"] = AUTOCORRECT_REVIEW_STATUS
    legacy["auditStatus"] = AUTOCORRECT_REVIEW_STATUS
    recompute_quality_warnings(sale, tolerance)
    return True


def critical_quality_warnings(sale: dict[str, Any], *, tolerance: int, max_ratio: float) -> list[dict[str, Any]]:
    warnings = recompute_quality_warnings(sale, tolerance)
    critical: list[dict[str, Any]] = []
    total = int(sale.get("totalCentavos", 0))
    for warning in warnings:
        if warning.get("code") == "invalid_date":
            critical.append(warning)
            continue
        if warning.get("code") == "total_mismatch":
            difference = abs(int(warning.get("differenceCentavos", 0)))
            ratio = difference / max(1, abs(total))
            if ratio > max_ratio:
                warning["ratio"] = round(ratio, 6)
                critical.append(warning)
    return critical


def format_bs(centavos: int) -> str:
    return f"{centavos / 100:,.2f}"


def print_sale_review_table(sale: dict[str, Any]) -> None:
    print("\nVenta:", sale_doc_id(sale))
    print(f"Fecha: {sale.get('fechaLocal')}  Total: Bs {format_bs(int(sale.get('totalCentavos', 0)))}")
    warnings = sale.get("legacy", {}).get("qualityWarnings", [])
    if warnings:
        print("Advertencias:", ", ".join(str(warning.get("code")) for warning in warnings))
    print(f"{'#':>2} {'Cant':>6} {'Precio':>11} {'Subtotal':>11}  Producto")
    print("-" * 92)
    for index, item in enumerate(sale.get("productos", []), start=1):
        print(
            f"{index:>2} "
            f"{int(item.get('cantidad', 0)):>6} "
            f"{format_bs(int(item.get('precioVendidoCentavos', 0))):>11} "
            f"{format_bs(int(item.get('subtotalCentavos', 0))):>11}  "
            f"{item.get('nombre', '')}"
        )
    product_total = sale_product_total(sale)
    difference = int(sale.get("totalCentavos", 0)) - product_total
    print("-" * 92)
    print(f"Suma items: Bs {format_bs(product_total)} | Diferencia: Bs {format_bs(difference)}")


def parse_review_money(value: str) -> int:
    return parse_money_centavos(value)


def snap_product_sale_money(value: int) -> int:
    remainder = abs(value) % 100
    sign = -1 if value < 0 else 1
    base = abs(value) - remainder
    if remainder in {1, 2, 3}:
        return sign * base
    if remainder in {48, 49, 51, 52, 53}:
        return sign * (base + 50)
    if remainder in {97, 98, 99}:
        return sign * (base + 100)
    return value


def apply_review_command(sale: dict[str, Any], command: str, corrections: list[dict[str, Any]]) -> bool:
    parts = command.strip().split(maxsplit=3)
    if not parts:
        return False
    action = parts[0].casefold()
    if action in {"h", "help", "ayuda"}:
        print("Comandos:")
        print("  e <fila> qty <entero>")
        print("  e <fila> price <bolivianos>")
        print("  e <fila> subtotal <bolivianos>")
        print("  e <fila> cost <bolivianos>")
        print("  e <fila> name <texto>")
        print("  a <cantidad> <precio_bolivianos> <producto>")
        print("  d <fila>")
        print("  total <bolivianos>")
        print("  date <YYYY-MM-DD>")
        print("  time <HH:MM:SS>")
        print("  ok")
        return False
    if action == "ok":
        return True
    if action == "total" and len(parts) >= 2:
        old_value = sale.get("totalCentavos")
        sale["totalCentavos"] = parse_review_money(parts[1])
        sale["recibidoCentavos"] = max(int(sale.get("recibidoCentavos", 0)), int(sale["totalCentavos"]))
        sale["cambioCentavos"] = max(0, int(sale.get("recibidoCentavos", 0)) - int(sale["totalCentavos"]))
        corrections.append({"field": "totalCentavos", "old": old_value, "new": sale["totalCentavos"]})
        return False
    if action == "date" and len(parts) >= 2:
        value = parts[1]
        datetime.strptime(value, "%Y-%m-%d")
        old_value = sale.get("fechaLocal")
        sale["fechaLocal"] = value
        corrections.append({"field": "fechaLocal", "old": old_value, "new": value})
        return False
    if action == "time" and len(parts) >= 2:
        value = parse_time(parts[1])
        old_value = sale.get("horaLocal")
        sale["horaLocal"] = value
        corrections.append({"field": "horaLocal", "old": old_value, "new": value})
        return False
    if action == "d" and len(parts) >= 2:
        index = int(parts[1]) - 1
        removed = sale["productos"].pop(index)
        corrections.append({"action": "delete_line", "index": index + 1, "old": removed})
        return False
    if action == "a" and len(parts) >= 4:
        quantity = parse_int(parts[1])
        price = parse_review_money(parts[2])
        name = clean_text(parts[3])
        if quantity <= 0 or price <= 0 or not name:
            raise ValueError("Uso: a <cantidad> <precio_bolivianos> <producto>")
        item = {
            "productoId": f"manual-line-{len(sale.get('productos', [])) + 1}",
            "nombre": name,
            "marca": None,
            "sku": None,
            "categoria": "Migrado FileMaker",
            "cantidad": quantity,
            "precioVentaCentavos": price,
            "precioVendidoCentavos": price,
            "subtotalCentavos": quantity * price,
            "precioCompraCentavos": 0,
            "utilidadCentavos": quantity * price,
            "legacy": {
                "manualAdded": True,
                "utilidadUnitariaCentavos": price,
                "descuentoCentavos": 0,
                "totalDescuentoCentavos": 0,
            },
        }
        sale.setdefault("productos", []).append(item)
        corrections.append({"action": "add_line", "index": len(sale["productos"]), "new": item})
        return False
    if action == "e" and len(parts) >= 4:
        index = int(parts[1]) - 1
        field = parts[2].casefold()
        value = parts[3]
        item = sale["productos"][index]
        if field in {"qty", "cantidad"}:
            old_value = item.get("cantidad")
            item["cantidad"] = parse_int(value)
            item["subtotalCentavos"] = int(item["cantidad"]) * int(item.get("precioVendidoCentavos", 0))
            corrections.append({"action": "edit_line", "index": index + 1, "field": "cantidad", "old": old_value, "new": item["cantidad"]})
            return False
        if field in {"price", "precio"}:
            old_value = item.get("precioVendidoCentavos")
            price = parse_review_money(value)
            item["precioVentaCentavos"] = price
            item["precioVendidoCentavos"] = price
            item["subtotalCentavos"] = int(item.get("cantidad", 0)) * price
            corrections.append({"action": "edit_line", "index": index + 1, "field": "precioVendidoCentavos", "old": old_value, "new": price})
            return False
        if field in {"cost", "costo", "compra"}:
            old_value = item.get("precioCompraCentavos")
            cost = parse_review_money(value)
            item["precioCompraCentavos"] = cost
            item["utilidadCentavos"] = (int(item.get("precioVendidoCentavos", 0)) - cost) * int(item.get("cantidad", 0))
            corrections.append({"action": "edit_line", "index": index + 1, "field": "precioCompraCentavos", "old": old_value, "new": cost})
            return False
        if field in {"subtotal", "sub"}:
            old_value = item.get("subtotalCentavos")
            item["subtotalCentavos"] = parse_review_money(value)
            corrections.append({"action": "edit_line", "index": index + 1, "field": "subtotalCentavos", "old": old_value, "new": item["subtotalCentavos"]})
            return False
        if field in {"name", "nombre"}:
            old_value = item.get("nombre")
            item["nombre"] = clean_text(value)
            corrections.append({"action": "edit_line", "index": index + 1, "field": "nombre", "old": old_value, "new": item["nombre"]})
            return False
    raise ValueError("Comando de revision no reconocido. Escribe 'help'.")


def interactive_review(
    sale: dict[str, Any],
    *,
    tolerance: int,
    review_mode: str,
    auto_correct_ratio: float,
) -> dict[str, Any]:
    corrections: list[dict[str, Any]] = []
    auto_correct_minor_mismatch(sale, tolerance=tolerance, max_ratio=auto_correct_ratio)
    warnings = recompute_quality_warnings(sale, tolerance)
    critical_warnings = critical_quality_warnings(sale, tolerance=tolerance, max_ratio=auto_correct_ratio)
    if review_mode == "never":
        sale.setdefault("legacy", {})["reviewStatus"] = "pending_review" if warnings else "clean"
        sale.setdefault("legacy", {})["manualCorrections"] = corrections
        return sale
    needs_review = (
        review_mode == "always"
        or (review_mode == "on-mismatch" and bool(warnings))
        or (review_mode == "critical" and bool(critical_warnings))
    )
    if not needs_review:
        sale.setdefault("legacy", {})["reviewStatus"] = sale.setdefault("legacy", {}).get("reviewStatus") or "clean"
        sale.setdefault("legacy", {})["manualCorrections"] = corrections
        return sale

    print_sale_review_table(sale)
    if review_mode == "critical":
        print("\nRevision humana requerida: fecha ilegible o discrepancia critica. Escribe 'help' para comandos.")
    else:
        print("\nModo Revision activo. Escribe 'help' para comandos o 'ok' cuando cuadre.")
    while True:
        warnings = recompute_quality_warnings(sale, tolerance)
        critical_warnings = critical_quality_warnings(sale, tolerance=tolerance, max_ratio=auto_correct_ratio)
        active_warnings = critical_warnings if review_mode == "critical" else warnings
        if not active_warnings:
            print_sale_review_table(sale)
            try:
                command = input("Sin discrepancias. Confirmar carga con 'ok' o editar: ").strip()
            except EOFError as exc:
                raise HumanReviewRequired("La venta requiere confirmacion humana en una consola interactiva.") from exc
        else:
            print_sale_review_table(sale)
            try:
                command = input("Correccion> ").strip()
            except EOFError as exc:
                raise HumanReviewRequired("La venta tiene discrepancias criticas y requiere correccion humana.") from exc
        try:
            done = apply_review_command(sale, command, corrections)
        except Exception as exc:
            print(f"Error: {exc}")
            continue
        warnings = recompute_quality_warnings(sale, tolerance)
        critical_warnings = critical_quality_warnings(sale, tolerance=tolerance, max_ratio=auto_correct_ratio)
        if done:
            active_warnings = critical_warnings if review_mode == "critical" else warnings
            if active_warnings:
                print("Aun hay discrepancias. Corrige antes de continuar.")
                continue
            break

    sale.setdefault("legacy", {})["reviewStatus"] = "manual_correction" if corrections else "clean_confirmed"
    sale.setdefault("legacy", {})["manualCorrections"] = corrections
    return sale


def upload_sale(sale: dict[str, Any], *, db, overwrite: bool) -> UploadResult:
    doc_id = sale_doc_id(sale)
    doc_ref = db.collection("ventas").document(doc_id)
    legacy = sale.setdefault("legacy", {})
    if not overwrite and doc_ref.get().exists:
        logging.info("Venta %s ya existe; omitida. Usa --overwrite para reemplazar.", doc_id)
        legacy["migrated"] = True
        legacy["uploadStatus"] = "skipped_existing"
        legacy["uploadedDocId"] = doc_id
        return UploadResult(doc_id=doc_id, status="skipped_existing", uploaded=False)
    sale["migrated"] = True
    legacy["migrated"] = True
    legacy["migratedAt"] = datetime.now().isoformat()
    legacy["uploadStatus"] = "uploaded"
    legacy["uploadedDocId"] = doc_id
    doc_ref.set(sale, merge=overwrite)
    customer_id = clean_text(sale.get("clienteId"))
    if customer_id:
        db.collection("clientes").document(customer_id).set(
            {
                "comprasCount": firestore.Increment(1),
                "totalCompradoCentavos": firestore.Increment(int(sale.get("totalCentavos", 0))),
                "ultimaCompraAt": sale.get("fechaLocal"),
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "updatedBy": "migration:filemaker-rpa",
            },
            merge=True,
        )
    logging.info("Venta subida a Firestore: %s", doc_id)
    return UploadResult(doc_id=doc_id, status="uploaded", uploaded=True)


def assert_sale_quality(sale: dict[str, Any], *, allow_uncertain: bool, tolerance: int, auto_correct_ratio: float) -> None:
    warnings = critical_quality_warnings(sale, tolerance=tolerance, max_ratio=auto_correct_ratio)
    if warnings and not allow_uncertain:
        raise RuntimeError(
            f"Venta {sale_doc_id(sale)} tiene advertencias criticas OCR: {warnings}. "
            "Corrige en modo revision o usa --allow-uncertain solo si decides cargarla igualmente."
        )


def write_jsonl(path: Path, record: dict[str, Any]) -> None:
    serializable = {
        **record,
        "auditWrittenAt": datetime.now().isoformat(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(serializable, ensure_ascii=False, default=str) + "\n")


def print_progress(migrated: int, total: int, errors: int) -> None:
    message = f"Ventas Migradas: {migrated} / Total: {total} | Errores: {errors}"
    sys.stdout.write("\r" + message.ljust(90))
    sys.stdout.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migra historial de ventas FileMaker a Firestore via RPA.")
    parser.add_argument("--window-title", default=DEFAULT_WINDOW_TITLE)
    parser.add_argument("--probe", action="store_true", help="Solo detecta ventana y guarda screenshot.")
    parser.add_argument(
        "--autonomous",
        action="store_true",
        help="Activa migracion masiva: commit por venta, revision solo critica y reanudacion local.",
    )
    parser.add_argument("--commit", action="store_true", help="Sube las ventas extraidas a Firestore.")
    parser.add_argument("--overwrite", action="store_true", help="Reemplaza ventas existentes con el mismo id legado.")
    parser.add_argument("--allow-uncertain", action="store_true", help="Permite subir ventas con advertencias OCR.")
    parser.add_argument("--ocr-fallback", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--clipboard-fallback", action="store_true", help="Permite intentar Ctrl+C en campos si OCR falla.")
    parser.add_argument("--already-in-detail", action="store_true", help="No hace clic en el triangulo de lista; empieza en detalle.")
    parser.add_argument("--start-list-row", type=int, default=0, help="Fila visible inicial en la lista de ventas.")
    parser.add_argument("--start-sequence", type=int, default=1, help="Numero secuencial para logs/migration legacy.")
    parser.add_argument("--max-records", type=int, default=1000, help="Cantidad de ventas a extraer.")
    parser.add_argument("--batch-size", type=int, default=100, help="Tamano de lote para procesar registros.")
    parser.add_argument("--review-mode", choices=["critical", "on-mismatch", "always", "never"], default="critical")
    parser.add_argument("--date-order", choices=["mdy", "dmy"], default="mdy")
    parser.add_argument("--ui-pause", type=float, default=0.35)
    parser.add_argument("--copy-pause", type=float, default=0.08)
    parser.add_argument("--list-triangle-x", type=int, default=14)
    parser.add_argument("--list-first-row-y", type=int, default=180)
    parser.add_argument("--list-row-height", type=int, default=16)
    parser.add_argument("--next-button-x", type=int, default=1185)
    parser.add_argument("--next-button-y", type=int, default=667)
    parser.add_argument("--product-row-height", type=int, default=32)
    parser.add_argument("--visible-product-rows", type=int, default=11)
    parser.add_argument("--product-scroll-x", type=int, default=1000)
    parser.add_argument("--product-scroll-y", type=int, default=610)
    parser.add_argument("--product-scroll-clicks", type=int, default=8)
    parser.add_argument("--product-scroll-wheel-clicks", type=int, default=0)
    parser.add_argument("--product-scroll-pagedown", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--product-scrollbar-x", type=int, default=1009)
    parser.add_argument("--product-scrollbar-top-y", type=int, default=307)
    parser.add_argument("--product-scrollbar-bottom-y", type=int, default=641)
    parser.add_argument("--product-scroll-reset-clicks", type=int, default=30)
    parser.add_argument("--product-scroll-page-clicks", type=int, default=9)
    parser.add_argument("--max-product-scrolls", type=int, default=12)
    parser.add_argument("--total-tolerance-centavos", type=int, default=5)
    parser.add_argument("--auto-correct-max-ratio", type=float, default=0.01, help="Autocorrige diferencias de total menores o iguales a este ratio.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_LOG_DIR)
    parser.add_argument("--state-db", type=Path, default=DEFAULT_STATE_DB, help="SQLite local para reanudar sin duplicar ventas.")
    return parser.parse_args()


def main() -> None:
    require_windows_rpa()
    args = parse_args()
    if args.autonomous:
        args.commit = True
        args.review_mode = "critical"
        args.allow_uncertain = False
        args.clipboard_fallback = True
        if args.product_scroll_wheel_clicks == 0:
            args.product_scroll_wheel_clicks = 6
        args.product_scroll_pagedown = True
    args.batch_size = max(1, args.batch_size)
    args.output_dir = args.output_dir.resolve()
    args.state_db = args.state_db.resolve()
    log_path = setup_logging(args.output_dir)
    output_jsonl = args.output_dir / f"rpa_history_migration_{_ts()}.jsonl"
    logging.info("Log: %s", log_path)
    logging.info("Commit Firestore: %s", args.commit)
    logging.info("Batch size: %s | Review mode: %s", args.batch_size, args.review_mode)
    logging.info("Estado local reanudable: %s", args.state_db)

    rpa = FileMakerRpa(args, args.output_dir)
    if args.probe:
        rpa.probe()
        return

    state = MigrationState(args.state_db)
    db = get_firestore_client() if args.commit else None
    resolver = FirestoreContextResolver(db) if db is not None else None
    migrated_count = 0
    error_count = 0
    run_uploaded_total_centavos = 0
    stop_requested = False

    try:
        if args.already_in_detail:
            logging.info("Modo detalle activo: se omite clic inicial en triangulo de lista.")
        else:
            rpa.enter_detail_from_list(args.start_list_row)

        print_progress(migrated_count, args.max_records, error_count)
        for batch_start in range(0, args.max_records, args.batch_size):
            batch_end = min(args.max_records, batch_start + args.batch_size)
            logging.info("Procesando lote %s-%s de %s", batch_start + 1, batch_end, args.max_records)
            for offset in range(batch_start, batch_end):
                sequence = args.start_sequence + offset
                sale: dict[str, Any] | None = None
                doc_id = f"sequence-{sequence}"
                audit_written = False
                try:
                    sale = rpa.extract_current_sale(sequence)
                    doc_id = sale_doc_id(sale)
                    legacy = sale.setdefault("legacy", {})

                    if args.commit and state.is_done(doc_id) and not args.overwrite:
                        legacy["migrated"] = True
                        legacy["uploadStatus"] = "skipped_state"
                        legacy["uploadedDocId"] = doc_id
                        legacy["auditStatus"] = "skipped_state"
                        write_jsonl(output_jsonl, sale)
                        state.mark(doc_id, sequence, "skipped_state", int(sale.get("totalCentavos", 0)))
                        audit_written = True
                        migrated_count += 1
                        logging.info("Venta %s omitida por estado local reanudable.", doc_id)
                        raise SkipCurrentSale()

                    sale = interactive_review(
                        sale,
                        tolerance=args.total_tolerance_centavos,
                        review_mode=args.review_mode,
                        auto_correct_ratio=args.auto_correct_max_ratio,
                    )
                    warnings = recompute_quality_warnings(sale, args.total_tolerance_centavos)
                    critical_warnings = critical_quality_warnings(
                        sale,
                        tolerance=args.total_tolerance_centavos,
                        max_ratio=args.auto_correct_max_ratio,
                    )
                    legacy = sale.setdefault("legacy", {})
                    legacy["batchSize"] = args.batch_size
                    legacy["batchNumber"] = (offset // args.batch_size) + 1
                    legacy.setdefault("manualCorrections", [])
                    if critical_warnings:
                        legacy["auditStatus"] = "pending_review"
                    elif legacy.get("manualCorrections"):
                        legacy["auditStatus"] = "manual_correction"
                    elif legacy.get("autoCorrections"):
                        legacy["auditStatus"] = AUTOCORRECT_REVIEW_STATUS
                    elif warnings:
                        legacy["auditStatus"] = "non_critical_warning"
                    else:
                        legacy["auditStatus"] = "clean"
                    legacy.setdefault("migrated", False)

                    if resolver is not None:
                        sale = resolver.enrich_sale(sale)

                    logging.info(
                        "Venta validada sequence=%s id=%s total=%s productos=%s estado_auditoria=%s",
                        sequence,
                        doc_id,
                        sale.get("totalCentavos"),
                        len(sale.get("productos", [])),
                        legacy.get("auditStatus"),
                    )
                    if args.commit:
                        assert_sale_quality(
                            sale,
                            allow_uncertain=args.allow_uncertain,
                            tolerance=args.total_tolerance_centavos,
                            auto_correct_ratio=args.auto_correct_max_ratio,
                        )
                        if db is None:
                            raise RuntimeError("Firestore no fue inicializado para commit.")
                        result = upload_sale(sale, db=db, overwrite=args.overwrite)
                        state.mark(result.doc_id, sequence, result.status, int(sale.get("totalCentavos", 0)))
                        if result.uploaded:
                            run_uploaded_total_centavos += int(sale.get("totalCentavos", 0))
                    write_jsonl(output_jsonl, sale)
                    audit_written = True
                    migrated_count += 1
                except SkipCurrentSale:
                    pass
                except HumanReviewRequired as exc:
                    error_count += 1
                    stop_requested = True
                    if sale is not None and not audit_written:
                        sale.setdefault("legacy", {})["processingError"] = str(exc)
                        sale.setdefault("legacy", {})["auditStatus"] = "requires_human_review"
                        write_jsonl(output_jsonl, sale)
                    state.mark(doc_id, sequence, "requires_human_review", int((sale or {}).get("totalCentavos", 0)), str(exc))
                    logging.error("Migracion pausada en sequence=%s: %s", sequence, exc)
                except KeyboardInterrupt:
                    print()
                    raise
                except Exception as exc:
                    error_count += 1
                    if sale is not None and not audit_written:
                        sale.setdefault("legacy", {})["processingError"] = str(exc)
                        write_jsonl(output_jsonl, sale)
                    state.mark(doc_id, sequence, "error", int((sale or {}).get("totalCentavos", 0)), str(exc))
                    logging.exception("Error procesando venta sequence=%s", sequence)
                finally:
                    print_progress(migrated_count, args.max_records, error_count)
                if stop_requested:
                    break
                if offset < args.max_records - 1:
                    rpa.next_detail_record()
            if stop_requested:
                break
        print()
    finally:
        state_summary = state.summary()
        state.close()

    logging.info("Extraccion finalizada. JSONL: %s", output_jsonl)
    logging.info("Monto subido en esta corrida: %s centavos.", run_uploaded_total_centavos)
    logging.info(
        "Resumen estado local: ventas_subidas=%s total_centavos=%s errores=%s",
        state_summary["uploadedCount"],
        state_summary["uploadedTotalCentavos"],
        state_summary["errorCount"],
    )


if __name__ == "__main__":
    main()
