from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import AuthenticatedUser, require_permission
from app.dependencies import get_repository
from app.domain.schemas import ProductCreate, ProductUpdate
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/productos", tags=["productos"])


@router.get("")
def list_products(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("inventory"))],
    estado: Annotated[bool | None, Query()] = True,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> list[dict]:
    return repository.list_products(estado=estado, query=q, include_financials=user.can_view_financials)


@router.post("", status_code=201)
def create_product(
    payload: ProductCreate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("inventory_write"))],
) -> dict:
    return repository.create_product(payload, user, include_financials=user.can_view_financials)


@router.patch("/{product_id}")
def update_product(
    product_id: str,
    payload: ProductUpdate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("inventory_write"))],
) -> dict:
    return repository.update_product(product_id, payload, user, include_financials=user.can_view_financials)


@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("inventory_write"))],
) -> dict:
    return repository.soft_delete_product(product_id, user)
