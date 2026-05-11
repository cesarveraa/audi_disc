from typing import Protocol

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


class InventoryRepository(Protocol):
    def list_products(self, estado: bool | None, query: str | None, include_financials: bool) -> list[dict]:
        ...

    def create_product(self, payload: ProductCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        ...

    def update_product(
        self,
        product_id: str,
        payload: ProductUpdate,
        user: AuthenticatedUser,
        include_financials: bool,
    ) -> dict:
        ...

    def update_inventory(self, payload: InventoryUpdate, user: AuthenticatedUser, include_financials: bool) -> dict:
        ...

    def soft_delete_product(self, product_id: str, user: AuthenticatedUser) -> dict:
        ...

    def create_sale(self, payload: SaleCreate, user: AuthenticatedUser, include_financials: bool) -> dict:
        ...

    def get_sale(self, sale_id: str, include_financials: bool) -> dict:
        ...

    def void_sale(self, sale_id: str, user: AuthenticatedUser, include_financials: bool) -> dict:
        ...

    def dashboard_summary(self) -> dict:
        ...

    def reports_dashboard(self, include_financials: bool) -> dict:
        ...

    def sales_history(self, date_from: str, date_to: str, include_financials: bool) -> dict:
        ...

    def list_customers(self, query: str | None) -> list[dict]:
        ...

    def create_customer(self, payload: CustomerCreate, user: AuthenticatedUser) -> dict:
        ...

    def update_customer(self, customer_id: str, payload: CustomerUpdate, user: AuthenticatedUser) -> dict:
        ...

    def customer_sales_history(self, customer_id: str, include_financials: bool) -> dict:
        ...

    def register_push_token(self, payload: PushTokenRegister, user: AuthenticatedUser) -> dict:
        ...
