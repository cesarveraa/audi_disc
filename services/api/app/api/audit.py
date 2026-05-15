from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import AuthenticatedUser, require_admin
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return repository.list_audit_logs(page=page, limit=limit)
