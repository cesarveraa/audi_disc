from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import AuthenticatedUser, require_permission
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("audit"))],
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return repository.list_audit_logs(page=page, limit=limit)
