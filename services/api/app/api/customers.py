from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import AuthenticatedUser, get_current_user
from app.dependencies import get_repository
from app.domain.schemas import CustomerCreate, CustomerUpdate
from app.repositories.base import InventoryRepository

router = APIRouter(tags=["customers"])


@router.get("/customers")
@router.get("/clientes")
def list_customers(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> list[dict]:
    return repository.list_customers(q)


@router.post("/customers", status_code=201)
@router.post("/clientes", status_code=201)
def create_customer(
    payload: CustomerCreate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.create_customer(payload, user)


@router.patch("/customers/{customer_id}")
@router.patch("/clientes/{customer_id}")
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.update_customer(customer_id, payload, user)


@router.get("/customers/{customer_id}/sales")
@router.get("/clientes/{customer_id}/ventas")
def customer_sales_history(
    customer_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.customer_sales_history(customer_id, include_financials=user.is_admin)
