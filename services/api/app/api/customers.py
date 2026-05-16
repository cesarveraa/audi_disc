from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import AuthenticatedUser, require_permission
from app.core.timeouts import run_with_wall_timeout
from app.dependencies import get_repository
from app.domain.schemas import CustomerCreate, CustomerUpdate
from app.repositories.base import InventoryRepository

router = APIRouter(tags=["customers"])
READ_TIMEOUT_SECONDS = 6.0


@router.get("/customers")
@router.get("/clientes")
def list_customers(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("customers"))],
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> list[dict]:
    return run_with_wall_timeout(
        lambda: repository.list_customers(q),
        default=[],
        context="customers endpoint",
        timeout_seconds=READ_TIMEOUT_SECONDS,
    )


@router.post("/customers", status_code=201)
@router.post("/clientes", status_code=201)
def create_customer(
    payload: CustomerCreate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("customers"))],
) -> dict:
    return repository.create_customer(payload, user)


@router.patch("/customers/{customer_id}")
@router.patch("/clientes/{customer_id}")
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("customers"))],
) -> dict:
    return repository.update_customer(customer_id, payload, user)


@router.get("/customers/{customer_id}/sales")
@router.get("/clientes/{customer_id}/ventas")
def customer_sales_history(
    customer_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("customers"))],
) -> dict:
    return repository.customer_sales_history(customer_id, include_financials=user.can_view_financials)
