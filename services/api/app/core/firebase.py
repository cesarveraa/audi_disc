import json
from typing import Any
from urllib.parse import quote

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import Settings, get_settings


def _normalize_private_key(value: str) -> str:
    return value.strip().strip('"').replace("\\n", "\n").strip()


def service_account_info_from_settings(settings: Settings) -> dict[str, Any]:
    if settings.firebase_service_account_json:
        try:
            data = json.loads(settings.firebase_service_account_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError("AUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSON no es JSON valido") from exc
        if "private_key" in data:
            data["private_key"] = _normalize_private_key(str(data["private_key"]))
        return data

    required = {
        "AUDIDISC_FIREBASE_PROJECT_ID": settings.firebase_project_id,
        "AUDIDISC_FIREBASE_CLIENT_EMAIL": settings.firebase_client_email,
        "AUDIDISC_FIREBASE_PRIVATE_KEY": settings.firebase_private_key,
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise RuntimeError(
            "Firebase Admin requiere credenciales por variables de entorno. "
            "Define AUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSON o estos campos: "
            f"{', '.join(missing)}."
        )

    client_email = str(settings.firebase_client_email)
    return {
        "type": "service_account",
        "project_id": settings.firebase_project_id,
        "private_key_id": settings.firebase_private_key_id or "",
        "private_key": _normalize_private_key(str(settings.firebase_private_key)),
        "client_email": client_email,
        "client_id": settings.firebase_client_id or "",
        "auth_uri": settings.firebase_auth_uri,
        "token_uri": settings.firebase_token_uri,
        "auth_provider_x509_cert_url": settings.firebase_auth_provider_x509_cert_url,
        "client_x509_cert_url": settings.firebase_client_x509_cert_url
        or f"https://www.googleapis.com/robot/v1/metadata/x509/{quote(client_email, safe='')}",
    }


def initialize_firebase() -> None:
    if firebase_admin._apps:
        return

    settings = get_settings()
    service_account = service_account_info_from_settings(settings)
    cred = credentials.Certificate(service_account)
    firebase_admin.initialize_app(cred, {"projectId": service_account["project_id"]})


def get_firestore_client():
    initialize_firebase()
    return firestore.client()
