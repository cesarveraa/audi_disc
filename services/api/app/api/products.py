from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import AuthenticatedUser, get_current_user, require_admin
from app.dependencies import get_repository
from app.domain.schemas import ProductCreate, ProductUpdate
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/productos", tags=["productos"])


@router.get("")
def list_products(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    estado: Annotated[bool | None, Query()] = True,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> list[dict]:
    return repository.list_products(estado=estado, query=q, include_financials=user.is_admin)


@router.post("", status_code=201)
def create_product(
    payload: ProductCreate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
) -> dict:
    return repository.create_product(payload, user, include_financials=True)


@router.patch("/{product_id}")
def update_product(
    product_id: str,
    payload: ProductUpdate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
) -> dict:
    return repository.update_product(product_id, payload, user, include_financials=True)


@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
) -> dict:
    return repository.soft_delete_product(product_id, user)

