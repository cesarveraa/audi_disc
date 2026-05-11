from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from starlette.responses import JSONResponse

from app.core.firebase import initialize_firebase


ADMIN_ROLE = "Administrador"
SELLER_ROLE = "Vendedor"
ALLOWED_ROLES = {ADMIN_ROLE, SELLER_ROLE}

bearer_scheme = HTTPBearer(auto_error=False)
PUBLIC_PATH_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json")


@dataclass(frozen=True)
class AuthenticatedUser:
    uid: str
    email: str | None
    display_name: str | None
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN_ROLE


def user_from_token(token: str) -> AuthenticatedUser:
    initialize_firebase()
    try:
        decoded = auth.verify_id_token(token, check_revoked=True)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked Firebase token",
        ) from exc

    role = decoded.get("role")
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User role is not authorized",
        )

    return AuthenticatedUser(
        uid=str(decoded["uid"]),
        email=decoded.get("email"),
        display_name=decoded.get("name"),
        role=role,
    )


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
    return path == "/" or any(path.startswith(prefix) for prefix in PUBLIC_PATH_PREFIXES)


async def firebase_auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or is_public_path(request.url.path):
        return await call_next(request)

    if get_current_user in request.app.dependency_overrides:
        return await call_next(request)

    try:
        request.state.authenticated_user = user_from_authorization_header(request.headers.get("Authorization"))
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
