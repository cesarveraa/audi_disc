from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, get_current_user
from app.dependencies import get_repository
from app.domain.schemas import PushTokenRegister
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/register-token", status_code=201)
def register_push_token(
    payload: PushTokenRegister,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.register_push_token(payload, user)
