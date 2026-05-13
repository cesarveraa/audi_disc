import hashlib
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from firebase_admin import messaging
from google.cloud import firestore

from app.core.config import get_settings
from app.core.firebase import get_firestore_client
from app.core.security import AuthenticatedUser
from app.domain.mappers import (
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


def _normalize_query(value: str | None) -> str:
    return (value or "").casefold().strip()


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


class FirestoreInventoryRepository:
    def __init__(self) -> None:
        self.db = get_firestore_client()
        self.products = self.db.collection("productos")
        self.sales = self.db.collection("ventas")
        self.customers = self.db.collection("clientes")
        self.inventory_logs = self.db.collection("inventarioLogs")
        self.push_tokens = self.db.collection("pushTokens")
        self.notifications = self.db.collection("notifications")
        self.audit_logs = self.db.collection("auditLogs")

    def list_products(self, estado: bool | None, query: str | None, include_financials: bool) -> list[dict]:
        ref = self.products
        if estado is not None:
            ref = ref.where("estado", "==", estado)

        normalized_query = _normalize_query(query)
        products = []
        for snapshot in ref.stream():
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
        ref = self.products.where("estado", "==", True)

        if marca:
            ref = ref.where("marca", "==", marca.strip())
        if categoria:
            ref = ref.where("categoria", "==", categoria.strip())

        if normalized_query:
            filtered = []
            for snapshot in ref.stream():
                data = snapshot.to_dict() or {}
                if int(data.get("cantidad", 0)) <= 0:
                    continue
                haystack = " ".join(
                    str(data.get(field) or "")
                    for field in ("nombre", "marca", "sku", "categoria")
                ).casefold()
                if normalized_query not in haystack:
                    continue
                filtered.append(normalize_product_doc(snapshot.id, data, False))

            total_count = len(filtered)
            items = filtered[offset:offset + limit]
            return {
                "items": items,
                "total_count": total_count,
                "has_more": offset + len(items) < total_count,
            }

        ref = ref.where("cantidad", ">", 0).order_by("cantidad")
        total_count = self._count_query(ref)
        snapshots = ref.offset(offset).limit(limit).stream()
        items = [
            normalize_product_doc(snapshot.id, snapshot.to_dict() or {}, False)
            for snapshot in snapshots
        ]
        return {
            "items": items,
            "total_count": total_count,
            "has_more": offset + len(items) < total_count,
        }

    @staticmethod
    def _count_query(query) -> int:
        try:
            results = query.count().get()
            return int(results[0][0].value)
        except Exception:
            return sum(1 for _snapshot in query.stream())

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

        update_data.update({"updatedAt": firestore.SERVER_TIMESTAMP, "updatedBy": user.uid})
        doc_ref.update(update_data)
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
            tx.update(
                product_ref,
                {
                    "cantidad": next_quantity,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                    "updatedBy": user.uid,
                },
            )
            tx.set(log_ref, log_doc)
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
        doc_ref.update(
            {
                "estado": False,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "updatedBy": user.uid,
            }
        )
        updated = doc_ref.get()
        return normalize_product_doc(product_id, updated.to_dict() or {}, True)

    def list_customers(self, query: str | None) -> list[dict]:
        normalized_query = _normalize_query(query)
        customers = []
        for snapshot in self.customers.where("estado", "==", True).stream():
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
        sales = [
            (snapshot.id, snapshot.to_dict() or {})
            for snapshot in self.sales.where("clienteId", "==", customer_id).where("estado", "==", True).stream()
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

        for snapshot in self.push_tokens.where("estado", "==", True).stream():
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
                {
                    "action": "SALE_VOID",
                    "saleId": sale_id,
                    "adminUid": user.uid,
                    "adminEmail": user.email,
                    "fechaLocal": now_local.date().isoformat(),
                    "horaLocal": now_local.time().replace(microsecond=0).isoformat(),
                    "restoredItems": restored_items,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                },
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
        sales = [
            snapshot.to_dict() or {}
            for snapshot in self.sales.where("fechaLocal", "==", today).where("estado", "==", True).stream()
        ]
        total = sum(int(sale.get("totalCentavos", 0)) for sale in sales)
        count = len(sales)
        alerts = []
        for snapshot in self.products.where("estado", "==", True).stream():
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
        snapshots = self.sales.where("fechaLocal", ">=", date_from).where("fechaLocal", "<=", date_to).stream()
        sales: list[tuple[str, dict]] = []
        for snapshot in snapshots:
            data = snapshot.to_dict() or {}
            if data.get("estado", True):
                sales.append((snapshot.id, data))
        return sorted(sales, key=lambda item: (item[1].get("fechaLocal", ""), item[1].get("horaLocal", "")), reverse=True)

    def _all_active_sales(self) -> list[tuple[str, dict]]:
        sales: list[tuple[str, dict]] = []
        for snapshot in self.sales.where("estado", "==", True).stream():
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
