import logging
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from firebase_admin import auth
from google.cloud import firestore

from app.core.config import get_settings
from app.core.firebase import get_firestore_client, initialize_firebase
from app.core.security import ADMIN_ROLE, DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, SELLER_ROLE
from app.domain.schemas import RoleCreate, RoleUpdate, UserAccessUpdate, UserCreate


FIRESTORE_ACCESS_TIMEOUT_SECONDS = 7.0
logger = logging.getLogger("audidisc.api.access")


PERMISSION_DEFINITIONS = [
    {
        "key": "inventory",
        "label": "Inventario",
        "zone": "Operacion",
        "description": "Ver productos, stock y disponibilidad operativa.",
    },
    {
        "key": "inventory_write",
        "label": "Gestionar inventario",
        "zone": "Operacion",
        "description": "Crear productos, editar fichas y ajustar stock.",
    },
    {
        "key": "sales",
        "label": "Ventas POS",
        "zone": "Caja",
        "description": "Entrar al punto de venta y registrar ventas.",
    },
    {
        "key": "customers",
        "label": "Clientes",
        "zone": "Comercial",
        "description": "Ver, crear y actualizar clientes.",
    },
    {
        "key": "reports",
        "label": "Reportes",
        "zone": "Direccion",
        "description": "Acceder al dashboard de reportes y exportaciones permitidas.",
    },
    {
        "key": "history",
        "label": "Ventas pasadas",
        "zone": "Direccion",
        "description": "Consultar historiales de ventas y anular operaciones.",
    },
    {
        "key": "analytics",
        "label": "BI",
        "zone": "Direccion",
        "description": "Ver analitica avanzada, Pareto, margenes e inventario inteligente.",
    },
    {
        "key": "audit",
        "label": "Auditoria",
        "zone": "Seguridad",
        "description": "Revisar trazabilidad de cambios sensibles.",
    },
    {
        "key": "users",
        "label": "Usuarios y roles",
        "zone": "Seguridad",
        "description": "Crear usuarios, roles y asignar zonas.",
    },
    {
        "key": "style",
        "label": "Guia de estilo",
        "zone": "Sistema",
        "description": "Ver el referente visual y componentes base del panel.",
    },
    {
        "key": "financials",
        "label": "Costos y utilidad",
        "zone": "Finanzas",
        "description": "Ver costos de compra, margenes y utilidad neta.",
    },
]

SYSTEM_ROLES = {
    "administrador": {
        "id": "administrador",
        "nombre": ADMIN_ROLE,
        "descripcion": "Acceso total al sistema Audi Disc.",
        "permissions": sorted(DEFAULT_ROLE_PERMISSIONS[ADMIN_ROLE]),
        "system": True,
        "estado": True,
        "updatedAt": None,
    },
    "vendedor": {
        "id": "vendedor",
        "nombre": SELLER_ROLE,
        "descripcion": "Operacion de caja, inventario visible y clientes.",
        "permissions": sorted(DEFAULT_ROLE_PERMISSIONS[SELLER_ROLE]),
        "system": True,
        "estado": True,
        "updatedAt": None,
    },
}


def _local_now_iso() -> str:
    return datetime.now(ZoneInfo(get_settings().timezone)).isoformat()


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "rol"


def _role_from_snapshot(role_id: str, data: dict) -> dict:
    return {
        "id": role_id,
        "nombre": str(data.get("nombre") or role_id),
        "descripcion": data.get("descripcion"),
        "permissions": sorted(str(permission) for permission in (data.get("permissions") or []) if permission in PERMISSION_KEYS),
        "system": bool(data.get("system", False)),
        "estado": bool(data.get("estado", True)),
        "updatedAt": data.get("updatedAt"),
    }


def _claims_for_role(role: dict) -> dict:
    return {
        "role": role["nombre"],
        "roleId": role["id"],
        "permissions": role["permissions"],
    }


def _metadata_ms_to_iso(value: int | None) -> str | None:
    if not value:
        return None
    return datetime.fromtimestamp(value / 1000).isoformat()


class AccessControlService:
    def __init__(self) -> None:
        initialize_firebase()
        self.db = get_firestore_client()
        self.roles = self.db.collection("roles")
        self.user_profiles = self.db.collection("user_profiles")

    def permission_definitions(self) -> list[dict]:
        return PERMISSION_DEFINITIONS

    def list_roles(self) -> list[dict]:
        roles = dict(SYSTEM_ROLES)
        try:
            snapshots = self.roles.stream(timeout=FIRESTORE_ACCESS_TIMEOUT_SECONDS)
            for snapshot in snapshots:
                data = snapshot.to_dict() or {}
                roles[snapshot.id] = _role_from_snapshot(snapshot.id, data)
        except Exception:
            logger.exception("roles query failed or timed out")
            return sorted(roles.values(), key=lambda role: (not role["system"], role["nombre"].casefold()))
        return sorted(roles.values(), key=lambda role: (not role["system"], role["nombre"].casefold()))

    def get_role(self, role_id: str) -> dict:
        normalized_id = _slugify(role_id)
        if normalized_id in SYSTEM_ROLES:
            return SYSTEM_ROLES[normalized_id]
        snapshot = self.roles.document(normalized_id).get()
        if not snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        role = _role_from_snapshot(snapshot.id, snapshot.to_dict() or {})
        if not role["estado"]:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role is inactive")
        return role

    def create_role(self, payload: RoleCreate) -> dict:
        role_id = _slugify(payload.nombre)
        if role_id in SYSTEM_ROLES or self.roles.document(role_id).get().exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists")
        role_doc = {
            "nombre": payload.nombre,
            "descripcion": payload.descripcion,
            "permissions": sorted(set(payload.permissions)),
            "system": False,
            "estado": True,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": _local_now_iso(),
        }
        self.roles.document(role_id).set(role_doc)
        return _role_from_snapshot(role_id, role_doc)

    def update_role(self, role_id: str, payload: RoleUpdate) -> dict:
        normalized_id = _slugify(role_id)
        if normalized_id in SYSTEM_ROLES:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="System roles cannot be edited")
        current = self.roles.document(normalized_id).get()
        if not current.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        updates = payload.model_dump(exclude_unset=True)
        if "permissions" in updates and updates["permissions"] is not None:
            updates["permissions"] = sorted(set(updates["permissions"]))
        updates["updatedAt"] = _local_now_iso()
        self.roles.document(normalized_id).update(updates)
        next_doc = {**(current.to_dict() or {}), **updates}
        return _role_from_snapshot(normalized_id, next_doc)

    def list_users(self) -> list[dict]:
        users = []
        for user in auth.list_users().iterate_all():
            users.append(self._managed_user_response(user))
        return sorted(users, key=lambda item: (item["disabled"], (item["email"] or "").casefold()))

    def create_user(self, payload: UserCreate) -> dict:
        role = self.get_role(payload.roleId)
        user = auth.create_user(
            email=payload.email,
            password=payload.password,
            display_name=payload.displayName,
            disabled=False,
        )
        auth.set_custom_user_claims(user.uid, _claims_for_role(role))
        self.user_profiles.document(user.uid).set(
            {
                "email": payload.email,
                "displayName": payload.displayName,
                "role": role["nombre"],
                "roleId": role["id"],
                "permissions": role["permissions"],
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return self._managed_user_response(auth.get_user(user.uid))

    def update_user_access(self, uid: str, payload: UserAccessUpdate) -> dict:
        role = self.get_role(payload.roleId)
        user = auth.get_user(uid)
        existing_claims = dict(user.custom_claims or {})
        auth.set_custom_user_claims(user.uid, {**existing_claims, **_claims_for_role(role)})
        self.user_profiles.document(user.uid).set(
            {
                "email": user.email,
                "displayName": user.display_name,
                "role": role["nombre"],
                "roleId": role["id"],
                "permissions": role["permissions"],
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return self._managed_user_response(auth.get_user(user.uid))

    def _managed_user_response(self, user) -> dict:
        claims = user.custom_claims or {}
        raw_role = claims.get("role")
        role = raw_role if isinstance(raw_role, str) and raw_role.strip() else SELLER_ROLE
        raw_role_id = claims.get("roleId")
        role_id = raw_role_id if isinstance(raw_role_id, str) and raw_role_id.strip() else _slugify(role)
        raw_permissions = claims.get("permissions")
        if isinstance(raw_permissions, list):
            permissions = sorted(str(permission) for permission in raw_permissions if str(permission) in PERMISSION_KEYS)
        else:
            permissions = sorted(DEFAULT_ROLE_PERMISSIONS.get(role, DEFAULT_ROLE_PERMISSIONS[SELLER_ROLE]))
        return {
            "uid": user.uid,
            "email": user.email,
            "displayName": user.display_name,
            "disabled": bool(user.disabled),
            "role": role,
            "roleId": role_id,
            "permissions": permissions,
            "lastSignInAt": _metadata_ms_to_iso(getattr(user.user_metadata, "last_sign_in_timestamp", None)),
            "createdAt": _metadata_ms_to_iso(getattr(user.user_metadata, "creation_timestamp", None)),
        }
