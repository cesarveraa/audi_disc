import hashlib
import logging
import math
from collections import defaultdict
from queue import Empty, Queue
from threading import Thread
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from firebase_admin import messaging
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from app.core.config import get_settings
from app.core.firebase import get_firestore_client
from app.core.security import AuthenticatedUser
from app.domain.mappers import (
    normalize_audit_log_doc,
    normalize_customer_doc,
    normalize_inventory_log_doc,
    normalize_product_doc,
    strip_sale_financials,
)
from app.domain.schemas import (
    CustomerCreate,
    CustomerUpdate,
    InventoryUpdate,
    ProductCreate,
    ProductUpdate,
    PushTokenRegister,
    SaleCreate,
)


logger = logging.getLogger("audidisc.audit")

AUDIT_PRICE_FIELDS = {"precioCompraCentavos", "precioVentaCentavos"}
AUDIT_SYSTEM_FIELDS = {"createdAt", "updatedAt", "createdBy", "updatedBy"}
ANALYTICS_LOOKBACK_DAYS = 90
DEFAULT_LEAD_TIME_DAYS = 7
DEAD_STOCK_DAYS = 122
CATALOG_FALLBACK_SCAN_LIMIT = 600
FIRESTORE_QUERY_TIMEOUT_SECONDS = 4.0
FIRESTORE_QUERY_GRACE_SECONDS = 0.75
PRODUCT_LIST_LIMIT = 1_500
CUSTOMER_SCAN_LIMIT = 300
CUSTOMER_SALES_LIMIT = 250
SALES_TODAY_LIMIT = 600
SALES_RANGE_LIMIT = 1_500
ACTIVE_SALES_LIMIT = 3_000


def _normalize_query(value: str | None) -> str:
    return (value or "").casefold().strip()


def _where(query, field: str, operator: str, value: object):
    return query.where(filter=FieldFilter(field, operator, value))


def _safe_stream(query, *, limit: int | None = None, context: str = "firestore") -> list:
    if limit is not None:
        query = query.limit(limit)
    result_queue: Queue[tuple[str, object]] = Queue(maxsize=1)

    def run_query() -> None:
        try:
            result_queue.put(("ok", list(query.stream(timeout=FIRESTORE_QUERY_TIMEOUT_SECONDS))))
        except Exception as exc:  # pragma: no cover - exercised only against live Firestore failures.
            result_queue.put(("error", exc))

    Thread(target=run_query, name=f"audidisc-{context.replace(' ', '-')}", daemon=True).start()
    try:
        status_value, payload = result_queue.get(timeout=FIRESTORE_QUERY_TIMEOUT_SECONDS + FIRESTORE_QUERY_GRACE_SECONDS)
    except Empty:
        logger.warning("%s query exceeded wall timeout", context)
        return []

    if status_value == "error":
        logger.warning("%s query failed or timed out: %s", context, payload)
        return []
    return list(payload)


def _sale_to_response(sale_id: str, data: dict, include_financials: bool) -> dict:
    sale = {
        "id": sale_id,
        "productos": data.get("productos", []),
        "totalCentavos": int(data.get("totalCentavos", 0)),
        "recibidoCentavos": int(data.get("recibidoCentavos", 0)),
        "cambioCentavos": int(data.get("cambioCentavos", 0)),
        "metodo": "QR" if data.get("metodo") == "Qr" else data.get("metodo", "Efectivo"),
        "fechaLocal": data.get("fechaLocal", ""),
        "horaLocal": data.get("horaLocal", ""),
        "estado": bool(data.get("estado", True)),
        "createdBy": data.get("createdBy", ""),
        "createdAt": data.get("createdAt"),
        "clienteId": data.get("clienteId"),
        "clienteSnapshot": data.get("clienteSnapshot"),
    }
    return strip_sale_financials(sale, include_financials)


def _sale_profit_centavos(data: dict) -> int:
    return sum(int(item.get("utilidadCentavos", 0)) for item in data.get("productos", []))


def _margin_percent(utilidad: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((utilidad / total) * 100, 2)


def _customer_haystack(data: dict) -> str:
    return " ".join(str(data.get(field) or "") for field in ("nombre", "telefono")).casefold()


def _month_label(month: int) -> str:
    labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    return labels[month - 1]


def _local_now() -> datetime:
    return datetime.now(ZoneInfo(get_settings().timezone))


def _parse_sale_date(value: object) -> date | None:
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _diff_changed_fields(before: dict, after: dict, candidate_fields: set[str] | None = None) -> tuple[dict, dict]:
    fields = candidate_fields or (set(before.keys()) | set(after.keys()))
    previous_data: dict = {}
    new_data: dict = {}
    for field in fields:
        if field in AUDIT_SYSTEM_FIELDS:
            continue
        if before.get(field) != after.get(field):
            previous_data[field] = before.get(field)
            new_data[field] = after.get(field)
    return previous_data, new_data


def _product_audit_action(previous_data: dict) -> str:
    if AUDIT_PRICE_FIELDS & set(previous_data):
        return "PRICE_CHANGE"
    if "cantidad" in previous_data:
        return "STOCK_ADJUST"
    return "UPDATE"


class FirestoreInventoryRepository:
    def __init__(self) -> None:
        self.db = get_firestore_client()
        self.products = self.db.collection("productos")
        self.sales = self.db.collection("ventas")
        self.customers = self.db.collection("clientes")
        self.inventory_logs = self.db.collection("inventarioLogs")
        self.push_tokens = self.db.collection("pushTokens")
        self.notifications = self.db.collection("notifications")
        self.audit_logs = self.db.collection("audit_logs")

    def list_products(self, estado: bool | None, query: str | None, include_financials: bool) -> list[dict]:
        ref = self.products
        if estado is not None:
            ref = _where(ref, "estado", "==", estado)

        normalized_query = _normalize_query(query)
        products = []
        for snapshot in _safe_stream(ref, limit=PRODUCT_LIST_LIMIT, context="products list"):
            data = snapshot.to_dict() or {}
            if normalized_query:
                haystack = " ".join(
                    str(data.get(field) or "")
                    for field in ("nombre", "marca", "sku", "categoria")
                ).casefold()
                if normalized_query not in haystack:
                    continue
            products.append(normalize_product_doc(snapshot.id, data, include_financials))
        return products

    def list_catalog_products(
        self,
        page: int,
        limit: int,
        query: str | None,
        marca: str | None,
        categoria: str | None,
    ) -> dict:
        page = max(page, 1)
        limit = max(min(limit, 50), 1)
        offset = (page - 1) * limit
        normalized_query = _normalize_query(query)
        ref = _where(self.products, "estado", "==", True)

        if marca:
            ref = _where(ref, "marca", "==", marca.strip())
        if categoria:
            ref = _where(ref, "categoria", "==", categoria.strip())

        if normalized_query:
            return self._scan_catalog_products(ref, offset, limit, normalized_query)

        try:
            snapshots = _safe_stream(
                ref.order_by("cantidad", direction=firestore.Query.DESCENDING).offset(offset),
                limit=limit + 1,
                context="catalog optimized query",
            )
            items = []
            for snapshot in snapshots:
                data = snapshot.to_dict() or {}
                if int(data.get("cantidad", 0)) <= 0:
                    continue
                items.append(normalize_product_doc(snapshot.id, data, False))
                if len(items) >= limit:
                    break
            has_more = len(snapshots) > limit
            return {
                "items": items,
                "total_count": offset + len(items) + (1 if has_more else 0),
                "has_more": has_more,
            }
        except Exception:
            logger.exception("catalog optimized query failed; falling back to bounded scan")
            return self._scan_catalog_products(ref, offset, limit, normalized_query)

    def _scan_catalog_products(self, ref, offset: int, limit: int, normalized_query: str) -> dict:
        scan_limit = min(CATALOG_FALLBACK_SCAN_LIMIT, max(offset + (limit * 4), limit + 1, 50))
        matched_count = 0
        scanned_count = 0
        items = []
        for snapshot in _safe_stream(ref, limit=scan_limit, context="catalog fallback scan"):
            scanned_count += 1
            data = snapshot.to_dict() or {}
            if int(data.get("cantidad", 0)) <= 0:
                continue
            if normalized_query:
                haystack = " ".join(
                    str(data.get(field) or "")
                    for field in ("nombre", "marca", "sku", "categoria")
                ).casefold()
                if normalized_query not in haystack:
                    continue
            matched_count += 1
            if matched_count <= offset:
                continue
            if len(items) < limit:
                items.append(normalize_product_doc(snapshot.id, data, False))

        reached_scan_limit = scanned_count >= scan_limit
        has_more = matched_count > offset + len(items) or reached_scan_limit
        return {
            "items": items,
            "total_count": matched_count,
            "has_more": has_more,
        }

    @staticmethod
    def _count_query(query) -> int:
        try:
            results = query.count().get()
            return int(results[0][0].value)
        except Exception:
            return sum(1 for _snapshot in _safe_stream(query, context="count fallback"))

    def _audit_doc(
        self,
        *,
        user: AuthenticatedUser,
        action: str,
        entity: str,
        entity_id: str,
        previous_data: dict,
        new_data: dict,
    ) -> dict:
        now_local = _local_now()
        return {
            "userId": user.uid,
            "userEmail": user.email,
            "action": action,
            "entity": entity,
            "entityId": entity_id,
            "previous_data": previous_data,
            "new_data": new_data,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "timestampLocal": now_local.isoformat(),
            "fechaLocal": now_local.date().isoformat(),
            "horaLocal": now_local.time().replace(microsecond=0).isoformat(),
        }

    def _write_audit_log(
        self,
        *,
        user: AuthenticatedUser,
        action: str,
        entity: str,
        entity_id: str,
        previous_data: dict,
        new_data: dict,
    ) -> None:
        if not previous_data and not new_data:
            return
        self.audit_logs.document().set(
            self._audit_doc(
                user=user,
                action=action,
                entity=entity,
                entity_id=entity_id,
                previous_data=previous_data,
                new_data=new_data,
            )
        )

    def list_audit_logs(self, page: int, limit: int) -> dict:
        page = max(page, 1)
        limit = max(min(limit, 100), 1)
        offset = (page - 1) * limit
        query = self.audit_logs.order_by("timestamp", direction=firestore.Query.DESCENDING)
        total_count = self._count_query(self.audit_logs)
        items = [
            normalize_audit_log_doc(snapshot.id, snapshot.to_dict() or {})
            for snapshot in _safe_stream(query.offset(offset), limit=limit, context="audit logs")
        ]
        return {
            "items": items,
            "total_count": total_count,
            "has_more": offset + len(items) < total_count,
        }

    def create_product(self, payload: ProductCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        now = firestore.SERVER_TIMESTAMP
        doc_ref = self.products.document()
        data = payload.model_dump()
        data.update(
            {
                "estado": True,
                "createdAt": now,
                "updatedAt": now,
                "createdBy": user.uid,
                "updatedBy": user.uid,
            }
        )
        doc_ref.set(data)
        snapshot = doc_ref.get()
        return normalize_product_doc(doc_ref.id, snapshot.to_dict() or data, include_financials)

    def update_product(
        self,
        product_id: str,
        payload: ProductUpdate,
        user: AuthenticatedUser,
        include_financials: bool,
    ) -> dict:
        doc_ref = self.products.document(product_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

        update_data = payload.model_dump(exclude_unset=True)
        current = snapshot.to_dict() or {}
        next_compra = update_data.get("precioCompraCentavos", current.get("precioCompraCentavos", 0))
        next_venta = update_data.get("precioVentaCentavos", current.get("precioVentaCentavos", 0))
        if next_venta < next_compra:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="precioVentaCentavos must be greater than or equal to precioCompraCentavos",
            )

        previous_data, new_data = _diff_changed_fields(
            current,
            {**current, **update_data},
            set(update_data.keys()),
        )
        update_data.update({"updatedAt": firestore.SERVER_TIMESTAMP, "updatedBy": user.uid})
        doc_ref.update(update_data)
        self._write_audit_log(
            user=user,
            action=_product_audit_action(previous_data),
            entity="productos",
            entity_id=product_id,
            previous_data=previous_data,
            new_data=new_data,
        )
        updated = doc_ref.get()
        return normalize_product_doc(product_id, updated.to_dict() or {}, include_financials)

    def update_inventory(self, payload: InventoryUpdate, user: AuthenticatedUser, include_financials: bool) -> dict:
        transaction = self.db.transaction()

        @firestore.transactional
        def run_update(tx):
            product_ref = self.products.document(payload.productoId)
            snapshot = product_ref.get(transaction=tx)
            if not snapshot.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

            product = snapshot.to_dict() or {}
            if not product.get("estado", True):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is inactive")

            current_quantity = int(product.get("cantidad", 0))
            next_quantity = current_quantity + payload.cantidadDelta
            if next_quantity < 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"El ajuste deja stock negativo para {product.get('nombre', payload.productoId)}. "
                        f"Disponible: {current_quantity}, ajuste: {payload.cantidadDelta}."
                    ),
                )

            log_ref = self.inventory_logs.document()
            log_doc = {
                "productoId": payload.productoId,
                "productoNombre": product.get("nombre", ""),
                "tipo": payload.tipo,
                "cantidadAnterior": current_quantity,
                "cantidadDelta": payload.cantidadDelta,
                "cantidadNueva": next_quantity,
                "motivo": payload.motivo,
                "referencia": payload.referencia,
                "createdBy": user.uid,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            audit_ref = self.audit_logs.document()
            audit_doc = self._audit_doc(
                user=user,
                action="STOCK_ADJUST",
                entity="productos",
                entity_id=payload.productoId,
                previous_data={"cantidad": current_quantity},
                new_data={
                    "cantidad": next_quantity,
                    "cantidadDelta": payload.cantidadDelta,
                    "motivo": payload.motivo,
                    "referencia": payload.referencia,
                },
            )
            tx.update(
                product_ref,
                {
                    "cantidad": next_quantity,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                    "updatedBy": user.uid,
                },
            )
            tx.set(log_ref, log_doc)
            tx.set(audit_ref, audit_doc)
            product["cantidad"] = next_quantity
            product["updatedBy"] = user.uid
            log_doc["createdAt"] = datetime.now(ZoneInfo(get_settings().timezone)).isoformat()
            return {
                "producto": normalize_product_doc(payload.productoId, product, include_financials),
                "log": normalize_inventory_log_doc(log_ref.id, log_doc),
            }

        return run_update(transaction)

    def soft_delete_product(self, product_id: str, user: AuthenticatedUser) -> dict:
        doc_ref = self.products.document(product_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        current = snapshot.to_dict() or {}
        doc_ref.update(
            {
                "estado": False,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "updatedBy": user.uid,
            }
        )
        self._write_audit_log(
            user=user,
            action="DELETE",
            entity="productos",
            entity_id=product_id,
            previous_data={"estado": bool(current.get("estado", True))},
            new_data={"estado": False},
        )
        updated = doc_ref.get()
        return normalize_product_doc(product_id, updated.to_dict() or {}, True)

    def list_customers(self, query: str | None) -> list[dict]:
        normalized_query = _normalize_query(query)
        customers = []
        customer_query = _where(self.customers, "estado", "==", True)
        for snapshot in _safe_stream(customer_query, limit=CUSTOMER_SCAN_LIMIT, context="customers list"):
            data = snapshot.to_dict() or {}
            if normalized_query and normalized_query not in _customer_haystack(data):
                continue
            customers.append(normalize_customer_doc(snapshot.id, data))
        return sorted(customers, key=lambda item: item["nombre"].casefold())[:80]

    def create_customer(self, payload: CustomerCreate, user: AuthenticatedUser) -> dict:
        now = firestore.SERVER_TIMESTAMP
        doc_ref = self.customers.document()
        data = {
            **payload.model_dump(),
            "estado": True,
            "comprasCount": 0,
            "totalCompradoCentavos": 0,
            "ultimaCompraAt": None,
            "createdAt": now,
            "updatedAt": now,
            "createdBy": user.uid,
            "updatedBy": user.uid,
        }
        doc_ref.set(data)
        snapshot = doc_ref.get()
        return normalize_customer_doc(doc_ref.id, snapshot.to_dict() or data)

    def update_customer(self, customer_id: str, payload: CustomerUpdate, user: AuthenticatedUser) -> dict:
        doc_ref = self.customers.document(customer_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
        update_data = payload.model_dump(exclude_unset=True)
        update_data.update({"updatedAt": firestore.SERVER_TIMESTAMP, "updatedBy": user.uid})
        doc_ref.update(update_data)
        updated = doc_ref.get()
        return normalize_customer_doc(customer_id, updated.to_dict() or {})

    def customer_sales_history(self, customer_id: str, include_financials: bool) -> dict:
        customer_snapshot = self.customers.document(customer_id).get()
        if not customer_snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
        sales_query = _where(_where(self.sales, "clienteId", "==", customer_id), "estado", "==", True)
        sales = [
            (snapshot.id, snapshot.to_dict() or {})
            for snapshot in _safe_stream(sales_query, limit=CUSTOMER_SALES_LIMIT, context="customer sales")
        ]
        sales = sorted(sales, key=lambda item: (item[1].get("fechaLocal", ""), item[1].get("horaLocal", "")), reverse=True)
        total = sum(int(sale.get("totalCentavos", 0)) for _sale_id, sale in sales)
        return {
            "cliente": normalize_customer_doc(customer_id, customer_snapshot.to_dict() or {}),
            "ventas": [_sale_to_response(sale_id, sale, include_financials) for sale_id, sale in sales],
            "totalCentavos": total,
            "cantidadVentas": len(sales),
        }

    def register_push_token(self, payload: PushTokenRegister, user: AuthenticatedUser) -> dict:
        token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()[:32]
        doc_ref = self.push_tokens.document(f"{user.uid}-{token_hash}")
        data = {
            "token": payload.token,
            "platform": payload.platform,
            "deviceId": payload.deviceId,
            "uid": user.uid,
            "role": user.role,
            "email": user.email,
            "estado": True,
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        doc_ref.set(data, merge=True)
        return {"registered": True, "platform": payload.platform}

    def _broadcast_operational_notification(self, event: dict) -> None:
        data = {key: str(value) for key, value in event.items() if value is not None}
        self.notifications.document().set(
            {
                **data,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )

        token_query = _where(self.push_tokens, "estado", "==", True)
        for snapshot in _safe_stream(token_query, limit=500, context="push tokens"):
            token_doc = snapshot.to_dict() or {}
            token = token_doc.get("token")
            if not token:
                continue
            try:
                messaging.send(
                    messaging.Message(
                        token=token,
                        notification=messaging.Notification(
                            title=str(event.get("title", "Audi Disc")),
                            body=str(event.get("body", "")),
                        ),
                        data=data,
                        android=messaging.AndroidConfig(
                            priority="high",
                            notification=messaging.AndroidNotification(
                                channel_id="audi-disc-operaciones",
                                color="#E4002B",
                            ),
                        ),
                        apns=messaging.APNSConfig(
                            payload=messaging.APNSPayload(
                                aps=messaging.Aps(sound="default", badge=1)
                            )
                        ),
                    )
                )
            except Exception as exc:
                logger.warning("push_notification_failed token_doc=%s error=%s", snapshot.id, exc)

    def create_sale(self, payload: SaleCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        transaction = self.db.transaction()

        @firestore.transactional
        def run_sale(tx):
            requested_by_product: dict[str, int] = {}
            for item in payload.productos:
                requested_by_product[item.productoId] = requested_by_product.get(item.productoId, 0) + item.cantidad

            product_refs = {
                product_id: self.products.document(product_id)
                for product_id in requested_by_product
            }
            snapshots_by_id = {
                product_id: ref.get(transaction=tx)
                for product_id, ref in product_refs.items()
            }
            customer_ref = self.customers.document(payload.clienteId) if payload.clienteId else None
            customer_data = None
            if customer_ref:
                customer_snapshot = customer_ref.get(transaction=tx)
                if not customer_snapshot.exists:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
                customer_data = customer_snapshot.to_dict() or {}
                if not customer_data.get("estado", True):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer is inactive")
            product_data_by_id: dict[str, dict] = {}
            for product_id, requested_quantity in requested_by_product.items():
                snapshot = snapshots_by_id[product_id]
                if not snapshot.exists:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
                product = snapshot.to_dict() or {}
                if not product.get("estado", True):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is inactive")
                current_stock = int(product.get("cantidad", 0))
                if current_stock < requested_quantity:
                    product_name = product.get("nombre", product_id)
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"Stock insuficiente para {product_name}. "
                            f"Disponible: {current_stock}, solicitado: {requested_quantity}."
                        ),
                    )
                product_data_by_id[product_id] = product

            items = []
            total_centavos = 0
            for item in payload.productos:
                product = product_data_by_id[item.productoId]
                precio_vendido = int(product.get("precioVentaCentavos", 0))
                subtotal = item.cantidad * precio_vendido
                total_centavos += subtotal
                precio_compra = int(product.get("precioCompraCentavos", 0))
                items.append(
                    {
                        "productoId": item.productoId,
                        "nombre": product.get("nombre", ""),
                        "marca": product.get("marca"),
                        "sku": product.get("sku"),
                        "categoria": product.get("categoria"),
                        "cantidad": item.cantidad,
                        "precioVentaCentavos": precio_vendido,
                        "precioVendidoCentavos": precio_vendido,
                        "subtotalCentavos": subtotal,
                        "precioCompraCentavos": precio_compra,
                        "utilidadCentavos": (precio_vendido - precio_compra) * item.cantidad,
                    }
                )

            if total_centavos != payload.totalCentavos:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Sale total mismatch")
            if payload.recibidoCentavos < total_centavos:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Received amount is insufficient")

            now_local = datetime.now(ZoneInfo(get_settings().timezone))
            sale_ref = self.sales.document()
            sale_doc = {
                "productos": items,
                "totalCentavos": total_centavos,
                "recibidoCentavos": payload.recibidoCentavos,
                "cambioCentavos": payload.recibidoCentavos - total_centavos,
                "metodo": payload.metodo,
                "fechaLocal": now_local.date().isoformat(),
                "horaLocal": now_local.time().replace(microsecond=0).isoformat(),
                "estado": True,
                "createdBy": user.uid,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            if customer_ref and customer_data is not None and payload.clienteId:
                sale_doc["clienteId"] = payload.clienteId
                sale_doc["clienteSnapshot"] = {
                    "id": payload.clienteId,
                    "nombre": customer_data.get("nombre", ""),
                    "telefono": customer_data.get("telefono", ""),
                }
                tx.update(
                    customer_ref,
                    {
                        "comprasCount": firestore.Increment(1),
                        "totalCompradoCentavos": firestore.Increment(total_centavos),
                        "ultimaCompraAt": now_local.isoformat(),
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                        "updatedBy": user.uid,
                    },
                )

            for product_id, requested_quantity in requested_by_product.items():
                ref = product_refs[product_id]
                tx.update(
                    ref,
                    {
                        "cantidad": firestore.Increment(-requested_quantity),
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                        "updatedBy": user.uid,
                    },
                )
            tx.set(sale_ref, sale_doc)
            sale_doc["id"] = sale_ref.id
            sale_doc["createdAt"] = now_local.isoformat()
            notification_events = []
            if total_centavos >= 100_000:
                notification_events.append(
                    {
                        "type": "high_value_sale",
                        "title": "Venta de alto valor",
                        "body": f"Se registro una venta por Bs {total_centavos / 100:,.2f}.",
                        "saleId": sale_ref.id,
                    }
                )
            for product_id, requested_quantity in requested_by_product.items():
                product = product_data_by_id[product_id]
                next_stock = int(product.get("cantidad", 0)) - requested_quantity
                stock_minimo = int(product.get("stockMinimo", 0))
                if next_stock <= stock_minimo:
                    notification_events.append(
                        {
                            "type": "low_stock",
                            "title": "Stock bajo",
                            "body": f"{product.get('nombre', product_id)} bajo a {next_stock} unidades.",
                            "productId": product_id,
                            "stock": str(next_stock),
                            "route": "product_edit",
                        }
                    )
            return strip_sale_financials(sale_doc, include_financials), notification_events

        sale_response, notification_events = run_sale(transaction)
        for event in notification_events:
            self._broadcast_operational_notification(event)
        return sale_response

    def get_sale(self, sale_id: str, include_financials: bool) -> dict:
        snapshot = self.sales.document(sale_id).get()
        if not snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found")
        return _sale_to_response(sale_id, snapshot.to_dict() or {}, include_financials)

    def void_sale(self, sale_id: str, user: AuthenticatedUser, include_financials: bool) -> dict:
        transaction = self.db.transaction()

        @firestore.transactional
        def run_void(tx):
            sale_ref = self.sales.document(sale_id)
            sale_snapshot = sale_ref.get(transaction=tx)
            if not sale_snapshot.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found")

            sale_doc = sale_snapshot.to_dict() or {}
            if not sale_doc.get("estado", True):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sale is already voided")

            now_local = datetime.now(ZoneInfo(get_settings().timezone))
            restored_items = []
            for item in sale_doc.get("productos", []):
                product_id = str(item.get("productoId", ""))
                quantity = int(item.get("cantidad", 0))
                if product_id and quantity > 0:
                    restored_items.append(
                        {
                            "productoId": product_id,
                            "nombre": item.get("nombre", ""),
                            "cantidad": quantity,
                        }
                    )
                    tx.update(
                        self.products.document(product_id),
                        {
                            "cantidad": firestore.Increment(quantity),
                            "updatedAt": firestore.SERVER_TIMESTAMP,
                            "updatedBy": user.uid,
                        },
                    )

            sale_doc.update(
                {
                    "estado": False,
                    "voidedBy": user.uid,
                    "voidedAt": now_local.isoformat(),
                    "updatedAt": now_local.isoformat(),
                    "updatedBy": user.uid,
                }
            )
            tx.set(
                self.audit_logs.document(),
                self._audit_doc(
                    user=user,
                    action="DELETE",
                    entity="ventas",
                    entity_id=sale_id,
                    previous_data={
                        "estado": True,
                        "productos": restored_items,
                    },
                    new_data={
                        "estado": False,
                        "voidedBy": user.uid,
                    },
                ),
            )
            tx.update(
                sale_ref,
                {
                    "estado": False,
                    "voidedBy": user.uid,
                    "voidedAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                    "updatedBy": user.uid,
                },
            )
            return _sale_to_response(sale_id, sale_doc, include_financials)

        result = run_void(transaction)
        logger.info(
            "sale_void sale_id=%s admin_uid=%s restored_items=%s",
            sale_id,
            user.uid,
            len(result.get("productos", [])),
        )
        return result

    def dashboard_summary(self) -> dict:
        today = datetime.now(ZoneInfo(get_settings().timezone)).date().isoformat()
        sales_query = _where(_where(self.sales, "fechaLocal", "==", today), "estado", "==", True)
        sales = [
            snapshot.to_dict() or {}
            for snapshot in _safe_stream(sales_query, limit=SALES_TODAY_LIMIT, context="dashboard today sales")
        ]
        total = sum(int(sale.get("totalCentavos", 0)) for sale in sales)
        count = len(sales)
        alerts = []
        products_query = _where(self.products, "estado", "==", True)
        for snapshot in _safe_stream(products_query, limit=PRODUCT_LIST_LIMIT, context="dashboard stock"):
            product = snapshot.to_dict() or {}
            cantidad = int(product.get("cantidad", 0))
            stock_minimo = int(product.get("stockMinimo", 0))
            if cantidad <= 0 or cantidad <= stock_minimo:
                severity = "critical" if cantidad <= 0 else "warning"
                alerts.append(
                    {
                        "producto": normalize_product_doc(snapshot.id, product, False),
                        "severity": severity,
                    }
                )

        return {
            "ventasHoy": {
                "totalCentavos": total,
                "cantidadVentas": count,
                "ticketPromedioCentavos": round(total / count) if count else 0,
            },
            "stockBajo": alerts,
        }

    def _sales_between(self, date_from: str, date_to: str) -> list[tuple[str, dict]]:
        query = _where(_where(self.sales, "fechaLocal", ">=", date_from), "fechaLocal", "<=", date_to)
        snapshots = _safe_stream(query, limit=SALES_RANGE_LIMIT, context="sales between")
        sales: list[tuple[str, dict]] = []
        for snapshot in snapshots:
            data = snapshot.to_dict() or {}
            if data.get("estado", True):
                sales.append((snapshot.id, data))
        return sorted(sales, key=lambda item: (item[1].get("fechaLocal", ""), item[1].get("horaLocal", "")), reverse=True)

    def _all_active_sales(self) -> list[tuple[str, dict]]:
        sales: list[tuple[str, dict]] = []
        query = _where(self.sales, "estado", "==", True)
        for snapshot in _safe_stream(query, limit=ACTIVE_SALES_LIMIT, context="active sales"):
            data = snapshot.to_dict() or {}
            if data.get("fechaLocal"):
                sales.append((snapshot.id, data))
        return sales

    def _analytics_snapshot(self, include_financials: bool) -> dict:
        sales = self._all_active_sales()
        years = sorted(
            {
                int(str(sale.get("fechaLocal", "0000"))[:4])
                for _sale_id, sale in sales
                if str(sale.get("fechaLocal", ""))[:4].isdigit()
            }
        )
        current_year = years[-1] if years else datetime.now(ZoneInfo(get_settings().timezone)).year
        previous_year = current_year - 1
        monthly = {
            year: {month: 0 for month in range(1, 13)}
            for year in (previous_year, current_year)
        }
        product_metrics: dict[str, dict] = {}
        customer_metrics: dict[str, dict] = {}

        for _sale_id, sale in sales:
            fecha = str(sale.get("fechaLocal", ""))
            try:
                year = int(fecha[:4])
                month = int(fecha[5:7])
            except ValueError:
                year = 0
                month = 0
            if year in monthly and 1 <= month <= 12:
                monthly[year][month] += int(sale.get("totalCentavos", 0))

            sale_profit = _sale_profit_centavos(sale)
            customer_id = sale.get("clienteId")
            customer_snapshot = sale.get("clienteSnapshot") or {}
            legacy = sale.get("legacy") or {}
            customer_key = str(customer_id or legacy.get("cliente") or "sin-cliente")
            customer = customer_metrics.setdefault(
                customer_key,
                {
                    "clienteId": customer_id,
                    "nombre": customer_snapshot.get("nombre") or legacy.get("cliente") or "Sin cliente",
                    "telefono": customer_snapshot.get("telefono"),
                    "cantidadCompras": 0,
                    "totalCentavos": 0,
                    "utilidadCentavos": 0,
                },
            )
            customer["cantidadCompras"] += 1
            customer["totalCentavos"] += int(sale.get("totalCentavos", 0))
            customer["utilidadCentavos"] += sale_profit

            for item in sale.get("productos", []):
                product_id = str(item.get("productoId") or item.get("nombre") or "sin-producto")
                product = product_metrics.setdefault(
                    product_id,
                    {
                        "productoId": product_id,
                        "nombre": item.get("nombre", "Sin nombre"),
                        "cantidadVendida": 0,
                        "totalCentavos": 0,
                        "utilidadCentavos": 0,
                    },
                )
                product["cantidadVendida"] += int(item.get("cantidad", 0))
                product["totalCentavos"] += int(item.get("subtotalCentavos", 0))
                product["utilidadCentavos"] += int(item.get("utilidadCentavos", 0))

        comparison = []
        for month in range(1, 13):
            previous_total = monthly[previous_year][month]
            current_total = monthly[current_year][month]
            delta = 0.0 if previous_total == 0 else round(((current_total - previous_total) / previous_total) * 100, 2)
            comparison.append(
                {
                    "mes": month,
                    "label": _month_label(month),
                    "currentYear": current_year,
                    "previousYear": previous_year,
                    "currentTotalCentavos": current_total,
                    "previousTotalCentavos": previous_total,
                    "deltaPorcentaje": delta,
                }
            )

        top_products = sorted(product_metrics.values(), key=lambda item: item["cantidadVendida"], reverse=True)[:5]
        top_customers = sorted(customer_metrics.values(), key=lambda item: item["totalCentavos"], reverse=True)[:5]
        if not include_financials:
            for collection in (top_products, top_customers):
                for item in collection:
                    item.pop("utilidadCentavos", None)
        return {
            "comparativaInteranual": comparison,
            "topProductos": top_products,
            "topClientes": top_customers,
        }

    def analytics_dashboard(self) -> dict:
        sales = self._all_active_sales()
        today = _local_now().date()
        lookback_start = today - timedelta(days=ANALYTICS_LOOKBACK_DAYS)
        dead_stock_cutoff = today - timedelta(days=DEAD_STOCK_DAYS)
        products_query = _where(self.products, "estado", "==", True)
        products = {
            snapshot.id: (snapshot.to_dict() or {})
            for snapshot in _safe_stream(products_query, limit=PRODUCT_LIST_LIMIT, context="analytics products")
        }

        total_revenue = 0
        total_cost = 0
        total_profit = 0
        product_metrics: dict[str, dict] = {}
        monthly_metrics: dict[str, dict] = {}
        demand_by_product: defaultdict[str, int] = defaultdict(int)
        last_sale_by_product: dict[str, date] = {}

        for _sale_id, sale in sales:
            sale_date = _parse_sale_date(sale.get("fechaLocal"))
            month_key = str(sale.get("fechaLocal", ""))[:7] if sale_date else "sin-fecha"
            month_number = sale_date.month if sale_date else 0
            month = monthly_metrics.setdefault(
                month_key,
                {
                    "mes": month_key,
                    "label": _month_label(month_number) if month_number else "Sin fecha",
                    "totalCentavos": 0,
                    "utilidadCentavos": 0,
                    "cantidadVentas": 0,
                    "audifonosCantidad": 0,
                    "audifonosCentavos": 0,
                },
            )
            month["cantidadVentas"] += 1

            for item in sale.get("productos", []):
                quantity = int(item.get("cantidad", 0))
                if quantity <= 0:
                    continue
                product_id = str(item.get("productoId") or item.get("nombre") or "sin-producto")
                sold_unit = int(item.get("precioVendidoCentavos") or item.get("precioVentaCentavos") or 0)
                revenue = int(item.get("subtotalCentavos") or (sold_unit * quantity))
                cost_unit = int(item.get("precioCompraCentavos") or 0)
                cost = cost_unit * quantity
                profit = int(item.get("utilidadCentavos", revenue - cost))
                product_name = item.get("nombre") or products.get(product_id, {}).get("nombre") or "Sin nombre"
                category = item.get("categoria") or products.get(product_id, {}).get("categoria") or "Sin categoria"

                total_revenue += revenue
                total_cost += cost
                total_profit += profit
                month["totalCentavos"] += revenue
                month["utilidadCentavos"] += profit

                normalized_text = f"{product_name} {category}".casefold()
                if "audif" in normalized_text or "auricular" in normalized_text or "headphone" in normalized_text:
                    month["audifonosCantidad"] += quantity
                    month["audifonosCentavos"] += revenue

                metric = product_metrics.setdefault(
                    product_id,
                    {
                        "productoId": product_id,
                        "nombre": product_name,
                        "marca": item.get("marca") or products.get(product_id, {}).get("marca"),
                        "categoria": category,
                        "cantidadVendida": 0,
                        "totalCentavos": 0,
                        "utilidadCentavos": 0,
                    },
                )
                metric["cantidadVendida"] += quantity
                metric["totalCentavos"] += revenue
                metric["utilidadCentavos"] += profit

                if sale_date:
                    if sale_date >= lookback_start:
                        demand_by_product[product_id] += quantity
                    previous_last_sale = last_sale_by_product.get(product_id)
                    if previous_last_sale is None or sale_date > previous_last_sale:
                        last_sale_by_product[product_id] = sale_date

        sorted_products = sorted(product_metrics.values(), key=lambda item: item["totalCentavos"], reverse=True)
        top_twenty_count = max(1, math.ceil(len(sorted_products) * 0.2)) if sorted_products else 0
        top_twenty_revenue = sum(item["totalCentavos"] for item in sorted_products[:top_twenty_count])
        cumulative = 0
        pareto_items = []
        for index, item in enumerate(sorted_products):
            previous_cumulative_percent = round((cumulative / total_revenue) * 100, 2) if total_revenue else 0.0
            cumulative += item["totalCentavos"]
            cumulative_percent = round((cumulative / total_revenue) * 100, 2) if total_revenue else 0.0
            pareto_items.append(
                {
                    **item,
                    "revenueSharePorcentaje": round((item["totalCentavos"] / total_revenue) * 100, 2)
                    if total_revenue
                    else 0.0,
                    "cumulativeSharePorcentaje": cumulative_percent,
                    "isTopTwenty": index < top_twenty_count,
                    "paretoClass": "A" if previous_cumulative_percent < 80 else "B" if cumulative_percent <= 95 else "C",
                }
            )

        reorder_alerts = []
        dead_stock = []
        for product_id, product in products.items():
            current_stock = int(product.get("cantidad", 0))
            safety_stock = int(product.get("stockMinimo", 0))
            avg_daily_demand = demand_by_product[product_id] / ANALYTICS_LOOKBACK_DAYS
            reorder_point = math.ceil((avg_daily_demand * DEFAULT_LEAD_TIME_DAYS) + safety_stock)
            if current_stock <= reorder_point:
                reorder_alerts.append(
                    {
                        "productoId": product_id,
                        "nombre": product.get("nombre", ""),
                        "marca": product.get("marca"),
                        "categoria": product.get("categoria"),
                        "stockActual": current_stock,
                        "demandaMediaDiaria": round(avg_daily_demand, 2),
                        "tiempoEntregaDias": DEFAULT_LEAD_TIME_DAYS,
                        "stockSeguridad": safety_stock,
                        "reorderPoint": reorder_point,
                        "sugerenciaCompra": max(reorder_point - current_stock, 0),
                    }
                )

            last_sale_date = last_sale_by_product.get(product_id)
            if current_stock > 0 and (last_sale_date is None or last_sale_date < dead_stock_cutoff):
                dead_stock.append(
                    {
                        "productoId": product_id,
                        "nombre": product.get("nombre", ""),
                        "marca": product.get("marca"),
                        "categoria": product.get("categoria"),
                        "stockActual": current_stock,
                        "ultimaVentaFecha": last_sale_date.isoformat() if last_sale_date else None,
                        "diasSinVenta": (today - last_sale_date).days if last_sale_date else None,
                        "valorInventarioCentavos": current_stock * int(product.get("precioVentaCentavos", 0)),
                    }
                )

        monthly_trends = sorted(monthly_metrics.values(), key=lambda item: item["mes"])
        headphone_months = sorted(
            [
                {
                    "mes": item["mes"],
                    "label": item["label"],
                    "cantidad": item["audifonosCantidad"],
                    "totalCentavos": item["audifonosCentavos"],
                }
                for item in monthly_trends
                if item["audifonosCantidad"] > 0
            ],
            key=lambda item: item["cantidad"],
            reverse=True,
        )[:6]

        return {
            "generatedAt": _local_now().isoformat(),
            "pareto": {
                "totalProductos": len(sorted_products),
                "topTwentyCount": top_twenty_count,
                "topTwentyRevenueSharePorcentaje": round((top_twenty_revenue / total_revenue) * 100, 2)
                if total_revenue
                else 0.0,
                "items": pareto_items[:20],
            },
            "tendencias": {
                "ventasPorMes": monthly_trends,
                "mesesFuertesAudifonos": headphone_months,
            },
            "margenes": {
                "ingresosCentavos": total_revenue,
                "costoCentavos": total_cost,
                "utilidadNetaCentavos": total_profit,
                "margenPorcentaje": _margin_percent(total_profit, total_revenue),
                "ventasAnalizadas": len(sales),
            },
            "inventario": {
                "leadTimeDias": DEFAULT_LEAD_TIME_DAYS,
                "lookbackDiasDemanda": ANALYTICS_LOOKBACK_DAYS,
                "reorderAlerts": sorted(reorder_alerts, key=lambda item: item["reorderPoint"] - item["stockActual"], reverse=True)[:20],
                "deadStock": sorted(dead_stock, key=lambda item: item["valorInventarioCentavos"], reverse=True)[:20],
            },
        }

    def reports_dashboard(self, include_financials: bool) -> dict:
        today = datetime.now(ZoneInfo(get_settings().timezone)).date()
        start = today - timedelta(days=6)
        sales = self._sales_between(start.isoformat(), today.isoformat())

        daily: dict[str, dict[str, int]] = {
            (start + timedelta(days=offset)).isoformat(): {
                "totalCentavos": 0,
                "cantidadVentas": 0,
                "utilidadCentavos": 0,
            }
            for offset in range(7)
        }

        for _sale_id, sale in sales:
            day = sale.get("fechaLocal", "")
            if day not in daily:
                continue
            daily[day]["totalCentavos"] += int(sale.get("totalCentavos", 0))
            daily[day]["cantidadVentas"] += 1
            daily[day]["utilidadCentavos"] += _sale_profit_centavos(sale)

        today_metrics = daily[today.isoformat()]
        total_today = today_metrics["totalCentavos"]
        count_today = today_metrics["cantidadVentas"]
        ventas_hoy = {
            "totalCentavos": total_today,
            "cantidadVentas": count_today,
            "ticketPromedioCentavos": round(total_today / count_today) if count_today else 0,
        }
        if include_financials:
            utilidad_today = today_metrics["utilidadCentavos"]
            ventas_hoy["utilidadCentavos"] = utilidad_today
            ventas_hoy["margenPorcentaje"] = _margin_percent(utilidad_today, total_today)

        weekly = []
        for day, metrics in daily.items():
            point = {
                "fechaLocal": day,
                "totalCentavos": metrics["totalCentavos"],
                "cantidadVentas": metrics["cantidadVentas"],
            }
            if include_financials:
                point["utilidadCentavos"] = metrics["utilidadCentavos"]
            weekly.append(point)

        stock = self.dashboard_summary()["stockBajo"]
        analytics = self._analytics_snapshot(include_financials)
        return {
            "ventasHoy": ventas_hoy,
            "ingresosSemanales": weekly,
            "stockBajo": stock,
            **analytics,
        }

    def sales_history(self, date_from: str, date_to: str, include_financials: bool) -> dict:
        sales = self._sales_between(date_from, date_to)
        total = sum(int(sale.get("totalCentavos", 0)) for _sale_id, sale in sales)
        utilidad = sum(_sale_profit_centavos(sale) for _sale_id, sale in sales)
        response = {
            "dateFrom": date_from,
            "dateTo": date_to,
            "totalCentavos": total,
            "cantidadVentas": len(sales),
            "ventas": [
                _sale_to_response(sale_id, sale, include_financials)
                for sale_id, sale in sales
            ],
        }
        if include_financials:
            response["utilidadCentavos"] = utilidad
            response["margenPorcentaje"] = _margin_percent(utilidad, total)
            response["impuestoEstimadoCentavos"] = round(total * 0.13)
            response["netoAntesImpuestoCentavos"] = max(0, total - response["impuestoEstimadoCentavos"])
        return response
