from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, require_admin
from app.dependencies import get_repository
from app.domain.schemas import InventoryUpdate, InventoryUpdateResponse
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.patch("/update", response_model=InventoryUpdateResponse)
def update_inventory(
    payload: InventoryUpdate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
) -> dict:
    return repository.update_inventory(payload, user, include_financials=True)
