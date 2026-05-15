from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, require_permission
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
def analytics_dashboard(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("analytics"))],
) -> dict:
    return repository.analytics_dashboard()
