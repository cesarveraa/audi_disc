from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from threading import Lock

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.core.security import AuthenticatedUser, get_current_user
from app.domain.mappers import normalize_product_doc, strip_sale_financials
from app.domain.schemas import InventoryUpdate, ProductCreate, ProductUpdate, SaleCreate
from app.main import create_app


class InMemoryInventoryRepository:
    def __init__(self) -> None:
        self.lock = Lock()
        self.products = {
            "p1": {
                "nombre": "Audifonos Pro",
                "marca": "Sony",
                "sku": "AUD-PRO-001",
                "categoria": "Audio",
                "cantidad": 5,
                "stockMinimo": 2,
                "precioCompraCentavos": 1000,
                "precioVentaCentavos": 1500,
                "imagenUrl": "https://cdn.audidisc.local/audifonos-pro.webp",
                "estado": True,
                "createdAt": "2026-05-07T08:00:00",
                "updatedAt": "2026-05-07T08:00:00",
            },
            "p2": {
                "nombre": "Cable USB",
                "marca": "Anker",
                "sku": "CAB-USB-010",
                "categoria": "Accesorios",
                "cantidad": 0,
                "stockMinimo": 3,
                "precioCompraCentavos": 300,
                "precioVentaCentavos": 700,
                "estado": True,
                "createdAt": "2026-05-07T08:00:00",
                "updatedAt": "2026-05-07T08:00:00",
            },
        }
        self.sales: dict[str, dict] = {}
        self.inventory_logs: dict[str, dict] = {}
        self.audit_logs: list[dict] = []

    def list_products(self, estado: bool | None, query: str | None, include_financials: bool) -> list[dict]:
        normalized = (query or "").casefold().strip()
        output = []
        for product_id, product in self.products.items():
            if estado is not None and product["estado"] != estado:
                continue
            if normalized:
                haystack = " ".join(
                    str(product.get(field) or "")
                    for field in ("nombre", "marca", "sku", "categoria")
                ).casefold()
                if normalized not in haystack:
                    continue
            output.append(normalize_product_doc(product_id, deepcopy(product), include_financials))
        return output

    def create_product(self, payload: ProductCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        product_id = f"p{len(self.products) + 1}"
        self.products[product_id] = {
            **payload.model_dump(),
            "estado": True,
            "createdAt": "2026-05-07T09:00:00",
            "updatedAt": "2026-05-07T09:00:00",
            "createdBy": user.uid,
            "updatedBy": user.uid,
        }
        return normalize_product_doc(product_id, self.products[product_id], include_financials)

    def update_product(
        self,
        product_id: str,
        payload: ProductUpdate,
        user: AuthenticatedUser,
        include_financials: bool,
    ) -> dict:
        if product_id not in self.products:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        update_data = payload.model_dump(exclude_unset=True)
        next_doc = {**self.products[product_id], **update_data}
        if next_doc["precioVentaCentavos"] < next_doc["precioCompraCentavos"]:
            raise HTTPException(status_code=422, detail="precioVentaCentavos must be greater than or equal to precioCompraCentavos")
        next_doc["updatedBy"] = user.uid
        next_doc["updatedAt"] = datetime.now().isoformat()
        self.products[product_id] = next_doc
        return normalize_product_doc(product_id, next_doc, include_financials)

    def update_inventory(self, payload: InventoryUpdate, user: AuthenticatedUser, include_financials: bool) -> dict:
        with self.lock:
            product = self.products.get(payload.productoId)
            if product is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
            if not product["estado"]:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is inactive")

            previous = int(product["cantidad"])
            next_quantity = previous + payload.cantidadDelta
            if next_quantity < 0:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El ajuste deja stock negativo")

            product["cantidad"] = next_quantity
            product["updatedBy"] = user.uid
            product["updatedAt"] = "2026-05-07T09:30:00"
            log_id = f"l{len(self.inventory_logs) + 1}"
            log = {
                "id": log_id,
                "productoId": payload.productoId,
                "productoNombre": product["nombre"],
                "tipo": payload.tipo,
                "cantidadAnterior": previous,
                "cantidadDelta": payload.cantidadDelta,
                "cantidadNueva": next_quantity,
                "motivo": payload.motivo,
                "referencia": payload.referencia,
                "createdBy": user.uid,
                "createdAt": "2026-05-07T09:30:00",
            }
            self.inventory_logs[log_id] = deepcopy(log)
            return {
                "producto": normalize_product_doc(payload.productoId, product, include_financials),
                "log": log,
            }

    def soft_delete_product(self, product_id: str, user: AuthenticatedUser) -> dict:
        if product_id not in self.products:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        self.products[product_id]["estado"] = False
        self.products[product_id]["updatedBy"] = user.uid
        return normalize_product_doc(product_id, self.products[product_id], True)

    def create_sale(self, payload: SaleCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        with self.lock:
            requested_by_product: dict[str, int] = {}
            for item in payload.productos:
                requested_by_product[item.productoId] = requested_by_product.get(item.productoId, 0) + item.cantidad

            for product_id, requested_quantity in requested_by_product.items():
                product = self.products.get(product_id)
                if product is None:
                    raise HTTPException(status_code=404, detail="Product not found")
                if not product["estado"]:
                    raise HTTPException(status_code=409, detail="Product is inactive")
                if product["cantidad"] < requested_quantity:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Stock insuficiente para {product['nombre']}. "
                            f"Disponible: {product['cantidad']}, solicitado: {requested_quantity}."
                        ),
                    )

            items = []
            total = 0
            for item in payload.productos:
                product = self.products[item.productoId]
                precio_vendido = product["precioVentaCentavos"]
                subtotal = item.cantidad * precio_vendido
                total += subtotal
                items.append(
                    {
                        "productoId": item.productoId,
                        "nombre": product["nombre"],
                        "marca": product["marca"],
                        "sku": product["sku"],
                        "categoria": product["categoria"],
                        "cantidad": item.cantidad,
                        "precioVentaCentavos": precio_vendido,
                        "precioVendidoCentavos": precio_vendido,
                        "subtotalCentavos": subtotal,
                        "precioCompraCentavos": product["precioCompraCentavos"],
                        "utilidadCentavos": (precio_vendido - product["precioCompraCentavos"]) * item.cantidad,
                    }
                )

            if total != payload.totalCentavos:
                raise HTTPException(status_code=422, detail="Sale total mismatch")
            if payload.recibidoCentavos < total:
                raise HTTPException(status_code=422, detail="Received amount is insufficient")

            for product_id, requested_quantity in requested_by_product.items():
                self.products[product_id]["cantidad"] -= requested_quantity

            sale_id = f"v{len(self.sales) + 1}"
            sale = {
                "id": sale_id,
                "productos": items,
                "totalCentavos": total,
                "recibidoCentavos": payload.recibidoCentavos,
                "cambioCentavos": payload.recibidoCentavos - total,
                "metodo": payload.metodo,
                "fechaLocal": "2026-05-07",
                "horaLocal": "10:30:00",
                "estado": True,
                "createdBy": user.uid,
                "createdAt": "2026-05-07T10:30:00",
            }
            self.sales[sale_id] = deepcopy(sale)
            return strip_sale_financials(sale, include_financials)

    def get_sale(self, sale_id: str, include_financials: bool) -> dict:
        sale = self.sales.get(sale_id)
        if sale is None:
            raise HTTPException(status_code=404, detail="Sale not found")
        return strip_sale_financials(deepcopy(sale), include_financials)

    def void_sale(self, sale_id: str, user: AuthenticatedUser, include_financials: bool) -> dict:
        with self.lock:
            sale = self.sales.get(sale_id)
            if sale is None:
                raise HTTPException(status_code=404, detail="Sale not found")
            if not sale["estado"]:
                raise HTTPException(status_code=409, detail="Sale is already voided")

            for item in sale["productos"]:
                product_id = item["productoId"]
                if product_id in self.products:
                    self.products[product_id]["cantidad"] += item["cantidad"]
                    self.products[product_id]["updatedBy"] = user.uid

            sale["estado"] = False
            sale["voidedBy"] = user.uid
            sale["voidedAt"] = "2026-05-07T11:00:00"
            sale["updatedBy"] = user.uid
            self.audit_logs.append(
                {
                    "action": "SALE_VOID",
                    "saleId": sale_id,
                    "adminUid": user.uid,
                    "restoredItems": [
                        {"productoId": item["productoId"], "cantidad": item["cantidad"]}
                        for item in sale["productos"]
                    ],
                }
            )
            self.sales[sale_id] = deepcopy(sale)
            return strip_sale_financials(deepcopy(sale), include_financials)

    def dashboard_summary(self) -> dict:
        total = sum(sale["totalCentavos"] for sale in self.sales.values() if sale["estado"])
        count = len([sale for sale in self.sales.values() if sale["estado"]])
        alerts = []
        for product_id, product in self.products.items():
            if product["estado"] and product["cantidad"] <= product["stockMinimo"]:
                alerts.append(
                    {
                        "producto": normalize_product_doc(product_id, product, False),
                        "severity": "critical" if product["cantidad"] <= 0 else "warning",
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

    def reports_dashboard(self, include_financials: bool) -> dict:
        base_date = datetime.fromisoformat("2026-05-07")
        weekly = []
        for offset in range(6, -1, -1):
            day = (base_date - timedelta(days=offset)).date().isoformat()
            day_sales = [sale for sale in self.sales.values() if sale["fechaLocal"] == day and sale["estado"]]
            total = sum(sale["totalCentavos"] for sale in day_sales)
            utilidad = sum(
                int(item.get("utilidadCentavos", 0))
                for sale in day_sales
                for item in sale["productos"]
            )
            point = {
                "fechaLocal": day,
                "totalCentavos": total,
                "cantidadVentas": len(day_sales),
            }
            if include_financials:
                point["utilidadCentavos"] = utilidad
            weekly.append(point)

        today = weekly[-1]
        ventas_hoy = {
            "totalCentavos": today["totalCentavos"],
            "cantidadVentas": today["cantidadVentas"],
            "ticketPromedioCentavos": round(today["totalCentavos"] / today["cantidadVentas"])
            if today["cantidadVentas"]
            else 0,
        }
        if include_financials:
            utilidad = int(today.get("utilidadCentavos", 0))
            ventas_hoy["utilidadCentavos"] = utilidad
            ventas_hoy["margenPorcentaje"] = round((utilidad / today["totalCentavos"]) * 100, 2) if today["totalCentavos"] else 0.0

        return {
            "ventasHoy": ventas_hoy,
            "ingresosSemanales": weekly,
            "stockBajo": self.dashboard_summary()["stockBajo"],
        }

    def sales_history(self, date_from: str, date_to: str, include_financials: bool) -> dict:
        sales = [
            sale
            for sale in self.sales.values()
            if date_from <= sale["fechaLocal"] <= date_to and sale["estado"]
        ]
        total = sum(sale["totalCentavos"] for sale in sales)
        utilidad = sum(
            int(item.get("utilidadCentavos", 0))
            for sale in sales
            for item in sale["productos"]
        )
        history_sales = [strip_sale_financials(deepcopy(sale), include_financials) for sale in sales]
        response = {
            "dateFrom": date_from,
            "dateTo": date_to,
            "totalCentavos": total,
            "cantidadVentas": len(sales),
            "ventas": history_sales,
        }
        if include_financials:
            response["utilidadCentavos"] = utilidad
            response["margenPorcentaje"] = round((utilidad / total) * 100, 2) if total else 0.0
        return response


def make_client(role: str = "Administrador", repository: InMemoryInventoryRepository | None = None) -> tuple[TestClient, InMemoryInventoryRepository]:
    repo = repository or InMemoryInventoryRepository()
    app = create_app(repo)
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        uid="test-user",
        email="test@audidisc.local",
        display_name="Test User",
        role=role,
    )
    return TestClient(app), repo


def test_protected_routes_require_firebase_bearer_token_without_override() -> None:
    app = create_app(InMemoryInventoryRepository())
    client = TestClient(app)

    response = client.get("/productos")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Firebase bearer token"


def test_public_catalog_products_do_not_require_auth_and_hide_sensitive_fields() -> None:
    app = create_app(InMemoryInventoryRepository())
    client = TestClient(app)

    response = client.get("/api/v1/public/products")

    assert response.status_code == 200
    payload = response.json()
    assert payload == [
        {
            "id": "p1",
            "nombre": "Audifonos Pro",
            "marca": "Sony",
            "categoria": "Audio",
            "precioVentaCentavos": 1500,
            "imagenUrl": "https://cdn.audidisc.local/audifonos-pro.webp",
        }
    ]
    assert set(payload[0]) == {
        "id",
        "nombre",
        "marca",
        "categoria",
        "precioVentaCentavos",
        "imagenUrl",
    }
    assert "cantidad" not in payload[0]
    assert "stockMinimo" not in payload[0]
    assert "precioCompraCentavos" not in payload[0]
    assert "utilidadCentavos" not in payload[0]
    assert "margenPorcentaje" not in payload[0]


def test_cors_allows_localhost_and_loopback_frontend_origins() -> None:
    client, _repo = make_client("Administrador")

    for origin in (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ):
        response = client.options(
            "/api/v1/productos",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_product_validation_rejects_extra_fields() -> None:
    client, _repo = make_client("Administrador")
    response = client.post(
        "/productos",
        json={
            "nombre": "Parlante",
            "cantidad": 4,
            "stockMinimo": 1,
            "precioCompraCentavos": 1000,
            "precioVentaCentavos": 1500,
            "unexpected": "blocked",
        },
    )

    assert response.status_code == 422


def test_seller_cannot_see_cost_or_margin() -> None:
    client, _repo = make_client("Vendedor")
    response = client.get("/productos")

    assert response.status_code == 200
    product = response.json()[0]
    assert "precioCompraCentavos" not in product
    assert "utilidadCentavos" not in product
    assert "margenPorcentaje" not in product


def test_admin_can_see_cost_and_margin() -> None:
    client, _repo = make_client("Administrador")
    response = client.get("/productos?q=sony")

    assert response.status_code == 200
    product = response.json()[0]
    assert product["precioCompraCentavos"] == 1000
    assert product["utilidadCentavos"] == 500
    assert product["margenPorcentaje"] == pytest.approx(33.33)


def test_soft_delete_preserves_product_with_inactive_state() -> None:
    client, _repo = make_client("Administrador")
    delete_response = client.delete("/productos/p1")
    list_response = client.get("/productos?estado=false")

    assert delete_response.status_code == 200
    assert delete_response.json()["estado"] is False
    assert list_response.status_code == 200
    assert list_response.json()[0]["id"] == "p1"
    assert list_response.json()[0]["estado"] is False


def test_sale_decrements_inventory_and_calculates_change() -> None:
    client, repo = make_client("Vendedor")
    response = client.post(
        "/ventas",
        json={
            "productos": [
                {
                    "productoId": "p1",
                    "cantidad": 2,
                    "precioVendidoCentavos": 1500,
                }
            ],
            "totalCentavos": 3000,
            "recibidoCentavos": 5000,
            "metodo": "Efectivo",
        },
    )

    assert response.status_code == 201
    sale = response.json()
    assert sale["cambioCentavos"] == 2000
    assert sale["createdBy"] == "test-user"
    assert sale["productos"][0]["precioVendidoCentavos"] == 1500
    assert repo.products["p1"]["cantidad"] == 3
    assert "precioCompraCentavos" not in sale["productos"][0]
    assert "utilidadCentavos" not in sale["productos"][0]


def test_sales_alias_decrements_inventory_and_keeps_snapshot() -> None:
    client, repo = make_client("Vendedor")
    response = client.post(
        "/sales",
        json={
            "productos": [
                {
                    "productoId": "p1",
                    "cantidad": 1,
                    "precioVendidoCentavos": 1400,
                }
            ],
            "totalCentavos": 1500,
            "recibidoCentavos": 2000,
            "metodo": "Efectivo",
        },
    )

    assert response.status_code == 201
    sale = response.json()
    assert sale["createdBy"] == "test-user"
    assert sale["fechaLocal"] == "2026-05-07"
    assert sale["productos"][0]["precioVendidoCentavos"] == 1500
    assert repo.products["p1"]["cantidad"] == 4


def test_checkout_endpoint_decrements_inventory_transactionally() -> None:
    client, repo = make_client("Vendedor")
    response = client.post(
        "/api/v1/sales/checkout",
        json={
            "productos": [
                {
                    "productoId": "p1",
                    "cantidad": 2,
                    "precioVendidoCentavos": 1500,
                }
            ],
            "totalCentavos": 3000,
            "recibidoCentavos": 3000,
            "metodo": "QR",
        },
    )

    assert response.status_code == 201
    sale = response.json()
    assert sale["metodo"] == "QR"
    assert sale["totalCentavos"] == 3000
    assert repo.products["p1"]["cantidad"] == 3


def test_sale_rejects_insufficient_stock_without_decrementing() -> None:
    client, repo = make_client("Vendedor")
    response = client.post(
        "/ventas",
        json={
            "productos": [
                {
                    "productoId": "p1",
                    "cantidad": 10,
                    "precioVendidoCentavos": 1500,
                }
            ],
            "totalCentavos": 15000,
            "recibidoCentavos": 15000,
            "metodo": "QR",
        },
    )

    assert response.status_code == 409
    assert "Stock insuficiente" in response.json()["detail"]
    assert repo.products["p1"]["cantidad"] == 5


def test_sale_rejects_duplicate_lines_when_combined_quantity_exceeds_stock() -> None:
    client, repo = make_client("Vendedor")
    response = client.post(
        "/ventas",
        json={
            "productos": [
                {"productoId": "p1", "cantidad": 3, "precioVendidoCentavos": 1500},
                {"productoId": "p1", "cantidad": 3, "precioVendidoCentavos": 1500},
            ],
            "totalCentavos": 9000,
            "recibidoCentavos": 9000,
            "metodo": "Efectivo",
        },
    )

    assert response.status_code == 409
    assert repo.products["p1"]["cantidad"] == 5


def test_inventory_update_adjusts_stock_and_logs_movement() -> None:
    client, repo = make_client("Administrador")
    response = client.patch(
        "/api/v1/inventory/update",
        json={
            "productoId": "p1",
            "tipo": "entrada",
            "cantidadDelta": 7,
            "motivo": "Nueva mercaderia",
            "referencia": "FAC-100",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["producto"]["cantidad"] == 12
    assert payload["log"]["cantidadAnterior"] == 5
    assert payload["log"]["cantidadDelta"] == 7
    assert payload["log"]["cantidadNueva"] == 12
    assert repo.inventory_logs["l1"]["createdBy"] == "test-user"


def test_inventory_update_rejects_negative_stock() -> None:
    client, repo = make_client("Administrador")
    response = client.patch(
        "/api/v1/inventory/update",
        json={
            "productoId": "p1",
            "tipo": "ajuste",
            "cantidadDelta": -8,
        },
    )

    assert response.status_code == 409
    assert repo.products["p1"]["cantidad"] == 5


def test_inventory_update_requires_admin_role() -> None:
    client, repo = make_client("Vendedor")
    response = client.patch(
        "/api/v1/inventory/update",
        json={
            "productoId": "p1",
            "tipo": "entrada",
            "cantidadDelta": 1,
        },
    )

    assert response.status_code == 403
    assert repo.products["p1"]["cantidad"] == 5


def test_dashboard_summary_reports_sales_and_low_stock() -> None:
    client, _repo = make_client("Administrador")
    client.post(
        "/ventas",
        json={
            "productos": [{"productoId": "p1", "cantidad": 1, "precioVendidoCentavos": 1500}],
            "totalCentavos": 1500,
            "recibidoCentavos": 1500,
            "metodo": "Transferencia",
        },
    )

    response = client.get("/dashboard/resumen-hoy")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ventasHoy"]["totalCentavos"] == 1500
    assert payload["ventasHoy"]["cantidadVentas"] == 1
    assert any(alert["severity"] == "critical" for alert in payload["stockBajo"])


def test_reports_dashboard_admin_includes_profit_and_weekly_revenue() -> None:
    client, _repo = make_client("Administrador")
    client.post(
        "/sales",
        json={
            "productos": [{"productoId": "p1", "cantidad": 1, "precioVendidoCentavos": 1500}],
            "totalCentavos": 1500,
            "recibidoCentavos": 1500,
            "metodo": "Efectivo",
        },
    )

    response = client.get("/reports/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ventasHoy"]["utilidadCentavos"] == 500
    assert payload["ventasHoy"]["margenPorcentaje"] == pytest.approx(33.33)
    assert len(payload["ingresosSemanales"]) == 7


def test_sales_history_hides_financials_for_seller() -> None:
    client, _repo = make_client("Vendedor")
    client.post(
        "/sales",
        json={
            "productos": [{"productoId": "p1", "cantidad": 1, "precioVendidoCentavos": 1500}],
            "totalCentavos": 1500,
            "recibidoCentavos": 2000,
            "metodo": "QR",
        },
    )

    response = client.get("/sales/history?dateFrom=2026-05-01&dateTo=2026-05-07")

    assert response.status_code == 200
    payload = response.json()
    assert "utilidadCentavos" not in payload
    assert "margenPorcentaje" not in payload
    assert "precioCompraCentavos" not in payload["ventas"][0]["productos"][0]
    assert "utilidadCentavos" not in payload["ventas"][0]["productos"][0]


def test_admin_void_sale_restores_stock_and_hides_from_history() -> None:
    client, repo = make_client("Administrador")
    sale_response = client.post(
        "/sales",
        json={
            "productos": [{"productoId": "p1", "cantidad": 2, "precioVendidoCentavos": 1500}],
            "totalCentavos": 3000,
            "recibidoCentavos": 3000,
            "metodo": "Efectivo",
        },
    )

    assert sale_response.status_code == 201
    assert repo.products["p1"]["cantidad"] == 3

    void_response = client.post(f"/sales/{sale_response.json()['id']}/void")
    history_response = client.get("/sales/history?dateFrom=2026-05-01&dateTo=2026-05-07")

    assert void_response.status_code == 200
    assert void_response.json()["estado"] is False
    assert repo.products["p1"]["cantidad"] == 5
    assert repo.audit_logs[-1]["action"] == "SALE_VOID"
    assert repo.audit_logs[-1]["adminUid"] == "test-user"
    assert history_response.json()["cantidadVentas"] == 0


def test_seller_cannot_void_sale() -> None:
    admin_client, repo = make_client("Administrador")
    sale_response = admin_client.post(
        "/sales",
        json={
            "productos": [{"productoId": "p1", "cantidad": 1, "precioVendidoCentavos": 1500}],
            "totalCentavos": 1500,
            "recibidoCentavos": 1500,
            "metodo": "Efectivo",
        },
    )
    seller_client, _repo = make_client("Vendedor", repo)

    response = seller_client.post(f"/sales/{sale_response.json()['id']}/void")

    assert response.status_code == 403
    assert repo.products["p1"]["cantidad"] == 4


def test_sale_receipt_pdf_is_generated_for_authenticated_seller() -> None:
    client, _repo = make_client("Vendedor")
    sale_response = client.post(
        "/sales",
        json={
            "productos": [{"productoId": "p1", "cantidad": 1, "precioVendidoCentavos": 1500}],
            "totalCentavos": 1500,
            "recibidoCentavos": 2000,
            "metodo": "Efectivo",
        },
    )

    response = client.get(f"/sales/{sale_response.json()['id']}/receipt.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_admin_cash_close_pdf_is_generated_and_seller_is_blocked() -> None:
    admin_client, repo = make_client("Administrador")
    admin_client.post(
        "/sales",
        json={
            "productos": [{"productoId": "p1", "cantidad": 1, "precioVendidoCentavos": 1500}],
            "totalCentavos": 1500,
            "recibidoCentavos": 1500,
            "metodo": "Transferencia",
        },
    )
    seller_client, _repo = make_client("Vendedor", repo)

    admin_response = admin_client.get("/reports/cash-close.pdf?dateFrom=2026-05-01&dateTo=2026-05-07")
    seller_response = seller_client.get("/reports/cash-close.pdf?dateFrom=2026-05-01&dateTo=2026-05-07")

    assert admin_response.status_code == 200
    assert admin_response.headers["content-type"] == "application/pdf"
    assert admin_response.content.startswith(b"%PDF")
    assert seller_response.status_code == 403
