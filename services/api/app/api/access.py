from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.security import AuthenticatedUser, require_permission
from app.domain.schemas import (
    ManagedUserResponse,
    PermissionDefinitionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
    UserAccessUpdate,
    UserCreate,
)
from app.services.access_control import AccessControlService

router = APIRouter(prefix="/access", tags=["access-control"])


def get_access_service() -> AccessControlService:
    return AccessControlService()


@router.get("/permissions", response_model=list[PermissionDefinitionResponse])
def permission_definitions(
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> list[dict]:
    return service.permission_definitions()


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> list[dict]:
    return service.list_roles()


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> dict:
    return service.create_role(payload)


@router.patch("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: str,
    payload: RoleUpdate,
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> dict:
    return service.update_role(role_id, payload)


@router.get("/users", response_model=list[ManagedUserResponse])
def list_users(
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> list[dict]:
    return service.list_users()


@router.post("/users", response_model=ManagedUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> dict:
    return service.create_user(payload)


@router.patch("/users/{uid}/access", response_model=ManagedUserResponse)
def update_user_access(
    uid: str,
    payload: UserAccessUpdate,
    _user: Annotated[AuthenticatedUser, Depends(require_permission("users"))],
    service: Annotated[AccessControlService, Depends(get_access_service)],
) -> dict:
    return service.update_user_access(uid, payload)
