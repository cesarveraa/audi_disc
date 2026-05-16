import json
import logging
from typing import Any
from urllib.parse import quote

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud import firestore as google_firestore
from google.cloud.firestore_v1.services.firestore import client as firestore_gapic_client

from app.core.config import Settings, get_settings

logger = logging.getLogger("audidisc.firebase")
_google_credentials = None
_firestore_project_id: str | None = None
_rest_firestore_client = None


class RestFirestoreClient(google_firestore.Client):
    @property
    def _firestore_api(self):
        if self._firestore_api_internal is None:
            self._firestore_api_internal = firestore_gapic_client.FirestoreClient(
                transport="rest",
                credentials=self._credentials,
                client_options=self._client_options,
                client_info=self._client_info,
            )
            firestore_gapic_client._client_info = self._client_info
        return self._firestore_api_internal


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
        logger.info(
            "AUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSON loaded project_id=%s client_email=%s has_private_key=%s",
            data.get("project_id"),
            data.get("client_email"),
            bool(data.get("private_key")),
        )
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
    logger.info(
        "Firebase service account loaded from split env project_id=%s client_email=%s has_private_key=%s",
        settings.firebase_project_id,
        client_email,
        bool(settings.firebase_private_key),
    )
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
    global _google_credentials, _firestore_project_id
    if firebase_admin._apps:
        app = firebase_admin.get_app()
        if _google_credentials is None:
            _google_credentials = app.credential.get_credential()
        if _firestore_project_id is None:
            _firestore_project_id = app.project_id
        return

    settings = get_settings()
    service_account = service_account_info_from_settings(settings)
    cred = credentials.Certificate(service_account)
    _google_credentials = cred.get_credential()
    _firestore_project_id = service_account["project_id"]
    firebase_admin.initialize_app(cred, {"projectId": service_account["project_id"]})
    logger.info("Firebase Admin initialized project_id=%s", service_account["project_id"])


def get_firestore_client():
    global _rest_firestore_client
    initialize_firebase()
    settings = get_settings()
    if settings.firestore_transport.casefold() == "rest":
        if _rest_firestore_client is None:
            _rest_firestore_client = RestFirestoreClient(
                project=_firestore_project_id or settings.firebase_project_id,
                credentials=_google_credentials,
            )
            logger.info("Firestore client initialized transport=rest project_id=%s", _firestore_project_id)
        return _rest_firestore_client
    return firestore.client()
