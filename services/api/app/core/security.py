import asyncio
import hashlib
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.firebase import initialize_firebase


ADMIN_ROLE = "Administrador"
SELLER_ROLE = "Vendedor"
ALLOWED_ROLES = {ADMIN_ROLE, SELLER_ROLE}
PERMISSION_KEYS = {
    "inventory",
    "inventory_write",
    "sales",
    "customers",
    "reports",
    "history",
    "analytics",
    "audit",
    "users",
    "style",
    "financials",
}
DEFAULT_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ADMIN_ROLE: frozenset(PERMISSION_KEYS),
    SELLER_ROLE: frozenset({"inventory", "sales", "customers"}),
}

bearer_scheme = HTTPBearer(auto_error=False)
TOKEN_CACHE_TTL_SECONDS = 300
TOKEN_CACHE_MAX_SIZE = 128
_token_cache: dict[str, tuple[float, "AuthenticatedUser"]] = {}
PUBLIC_PATHS = (
    "/",
    "/health",
    "/api/v1/health",
    "/favicon.ico",
    "/favicon.png",
    "/audidisc.jpg",
    "/logo.png",
    "/logo.svg",
    "/openapi.json",
)
PUBLIC_PATH_PREFIXES = ("/docs", "/redoc", "/api/v1/public/")


@dataclass(frozen=True)
class AuthenticatedUser:
    uid: str
    email: str | None
    display_name: str | None
    role: str
    role_id: str | None = None
    permissions: frozenset[str] = frozenset()

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN_ROLE

    @property
    def effective_permissions(self) -> frozenset[str]:
        return self.permissions or DEFAULT_ROLE_PERMISSIONS.get(self.role, frozenset())

    @property
    def can_view_financials(self) -> bool:
        return self.is_admin or "financials" in self.effective_permissions

    def has_permission(self, permission: str) -> bool:
        return self.is_admin or permission in self.effective_permissions


def _permissions_from_claims(role: str, raw_permissions: object) -> frozenset[str]:
    if isinstance(raw_permissions, list):
        permissions = {str(permission) for permission in raw_permissions if str(permission) in PERMISSION_KEYS}
        if permissions:
            return frozenset(permissions)
    return DEFAULT_ROLE_PERMISSIONS.get(role, frozenset())


def _token_cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cached_user(token: str) -> AuthenticatedUser | None:
    cached = _token_cache.get(_token_cache_key(token))
    if not cached:
        return None
    expires_at, user = cached
    if expires_at <= time.monotonic():
        _token_cache.pop(_token_cache_key(token), None)
        return None
    return user


def _remember_user(token: str, user: AuthenticatedUser) -> None:
    if len(_token_cache) >= TOKEN_CACHE_MAX_SIZE:
        oldest_key = min(_token_cache, key=lambda key: _token_cache[key][0])
        _token_cache.pop(oldest_key, None)
    _token_cache[_token_cache_key(token)] = (time.monotonic() + TOKEN_CACHE_TTL_SECONDS, user)


def user_from_token(token: str) -> AuthenticatedUser:
    settings = get_settings()
    check_revoked_tokens = settings.should_check_revoked_tokens
    if not check_revoked_tokens:
        cached = _cached_user(token)
        if cached:
            return cached

    initialize_firebase()
    try:
        decoded = auth.verify_id_token(token, check_revoked=check_revoked_tokens)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked Firebase token",
        ) from exc

    role = decoded.get("role")
    if not isinstance(role, str) or not role.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User role is not authorized",
        )
    role = role.strip()
    permissions = _permissions_from_claims(role, decoded.get("permissions"))
    if not permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User role is not authorized",
        )

    user = AuthenticatedUser(
        uid=str(decoded["uid"]),
        email=decoded.get("email"),
        display_name=decoded.get("name"),
        role=role,
        role_id=decoded.get("roleId") if isinstance(decoded.get("roleId"), str) else role,
        permissions=permissions,
    )
    if not check_revoked_tokens:
        _remember_user(token, user)
    return user


def user_from_authorization_header(value: str | None) -> AuthenticatedUser:
    if not value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Firebase bearer token",
        )

    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Firebase bearer token",
        )
    return user_from_token(token)


def is_public_path(path: str) -> bool:
    return path in PUBLIC_PATHS or any(path.startswith(prefix) for prefix in PUBLIC_PATH_PREFIXES)


async def firebase_auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or is_public_path(request.url.path):
        return await call_next(request)

    if get_current_user in request.app.dependency_overrides:
        return await call_next(request)

    try:
        request.state.authenticated_user = await asyncio.wait_for(
            run_in_threadpool(user_from_authorization_header, request.headers.get("Authorization")),
            timeout=get_settings().firebase_auth_timeout_seconds,
        )
    except TimeoutError:
        return JSONResponse(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            content={"detail": "Firebase Auth timed out"},
            headers={"X-Error-Message": "Firebase Auth timed out"},
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers={"X-Error-Message": str(exc.detail)},
        )

    return await call_next(request)


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    state_user = getattr(request.state, "authenticated_user", None)
    if isinstance(state_user, AuthenticatedUser):
        return state_user

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Firebase bearer token",
        )
    return user_from_token(credentials.credentials)


def require_admin(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrador role required",
        )
    return user


def require_permission(permission: str) -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    def dependency(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
        if not user.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {permission}",
            )
        return user

    return dependency
