from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, get_current_user
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/resumen-hoy")
def resumen_hoy(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.dashboard_summary()

