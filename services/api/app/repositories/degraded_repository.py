from fastapi import HTTPException, status

from app.core.security import AuthenticatedUser
from app.domain.schemas import (
    CustomerCreate,
    CustomerUpdate,
    InventoryUpdate,
    ProductCreate,
    ProductUpdate,
    PushTokenRegister,
    SaleCreate,
)


def _unavailable() -> None:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Firestore no esta respondiendo. Intenta nuevamente en unos segundos.",
    )


class DegradedInventoryRepository:
    def list_products(self, estado: bool | None, query: str | None, include_financials: bool) -> list[dict]:
        return []

    def list_catalog_products(
        self,
        page: int,
        limit: int,
        query: str | None,
        marca: str | None,
        categoria: str | None,
    ) -> dict:
        return {"items": [], "total_count": 0, "has_more": False}

    def dashboard_summary(self) -> dict:
        return {
            "ventasHoy": {
                "totalCentavos": 0,
                "cantidadVentas": 0,
                "ticketPromedioCentavos": 0,
            },
            "stockBajo": [],
        }

    def list_customers(self, query: str | None) -> list[dict]:
        return []

    def list_audit_logs(self, page: int, limit: int) -> dict:
        return {"items": [], "total_count": 0, "has_more": False}

    def analytics_dashboard(self) -> dict:
        return {
            "summary": {
                "totalRevenueCentavos": 0,
                "totalProfitCentavos": 0,
                "averageMarginPercent": 0,
                "paretoTopPercentRevenue": 0,
                "salesCount": 0,
            },
            "pareto": [],
            "monthlyTrends": [],
            "seasonality": [],
            "reorderSuggestions": [],
            "deadStock": [],
        }

    def reports_dashboard(self, include_financials: bool) -> dict:
        return {
            "today": {
                "totalCentavos": 0,
                "cantidadVentas": 0,
                "ticketPromedioCentavos": 0,
                "utilidadCentavos": 0,
                "margenPorcentaje": 0,
            },
            "week": {"totalCentavos": 0, "cantidadVentas": 0, "days": []},
            "hourly": [],
            "stockAlerts": [],
        }

    def sales_history(self, date_from: str, date_to: str, include_financials: bool) -> dict:
        return {
            "items": [],
            "totalCentavos": 0,
            "cantidadVentas": 0,
            "utilidadCentavos": 0,
        }

    def customer_sales_history(self, customer_id: str, include_financials: bool) -> dict:
        return {"customer": None, "sales": [], "totalCentavos": 0, "cantidadVentas": 0}

    def create_product(self, payload: ProductCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        _unavailable()

    def update_product(
        self,
        product_id: str,
        payload: ProductUpdate,
        user: AuthenticatedUser,
        include_financials: bool,
    ) -> dict:
        _unavailable()

    def update_inventory(self, payload: InventoryUpdate, user: AuthenticatedUser, include_financials: bool) -> dict:
        _unavailable()

    def soft_delete_product(self, product_id: str, user: AuthenticatedUser) -> dict:
        _unavailable()

    def create_sale(self, payload: SaleCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        _unavailable()

    def get_sale(self, sale_id: str, include_financials: bool) -> dict:
        _unavailable()

    def void_sale(self, sale_id: str, user: AuthenticatedUser, include_financials: bool) -> dict:
        _unavailable()

    def create_customer(self, payload: CustomerCreate, user: AuthenticatedUser) -> dict:
        _unavailable()

    def update_customer(self, customer_id: str, payload: CustomerUpdate, user: AuthenticatedUser) -> dict:
        _unavailable()

    def register_push_token(self, payload: PushTokenRegister, user: AuthenticatedUser) -> dict:
        _unavailable()
