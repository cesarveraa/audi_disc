from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, get_current_user
from app.domain.schemas import CurrentUserResponse

router = APIRouter(tags=["me"])


@router.get("/me", response_model=CurrentUserResponse)
def me(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> CurrentUserResponse:
    return CurrentUserResponse(
        uid=user.uid,
        email=user.email,
        displayName=user.display_name,
        role=user.role,
        roleId=user.role_id,
        permissions=sorted(user.effective_permissions),  # type: ignore[arg-type]
    )
