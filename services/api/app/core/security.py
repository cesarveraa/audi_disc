from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from app.core.firebase import initialize_firebase


ADMIN_ROLE = "Administrador"
SELLER_ROLE = "Vendedor"
ALLOWED_ROLES = {ADMIN_ROLE, SELLER_ROLE}

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    uid: str
    email: str | None
    display_name: str | None
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN_ROLE


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Firebase bearer token",
        )

    initialize_firebase()
    try:
        decoded = auth.verify_id_token(credentials.credentials, check_revoked=True)
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


def require_admin(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrador role required",
        )
    return user

