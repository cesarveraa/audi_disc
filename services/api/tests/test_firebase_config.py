import pytest

from app.core.config import Settings
from app.core.firebase import service_account_info_from_settings


def test_service_account_can_be_loaded_from_single_json_env() -> None:
    settings = Settings(
        _env_file=None,
        firebase_service_account_json=(
            '{"type":"service_account","project_id":"demo",'
            '"private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",'
            '"client_email":"admin@demo.iam.gserviceaccount.com"}'
        ),
    )

    info = service_account_info_from_settings(settings)

    assert info["project_id"] == "demo"
    assert info["private_key"] == "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"


def test_service_account_can_be_loaded_from_split_env_fields() -> None:
    settings = Settings(
        _env_file=None,
        firebase_project_id="demo",
        firebase_client_email="admin@demo.iam.gserviceaccount.com",
        firebase_private_key="-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    )

    info = service_account_info_from_settings(settings)

    assert info["type"] == "service_account"
    assert info["project_id"] == "demo"
    assert info["client_email"] == "admin@demo.iam.gserviceaccount.com"
    assert info["private_key"] == "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"


def test_service_account_env_is_required_for_firebase_admin() -> None:
    settings = Settings(_env_file=None)

    with pytest.raises(RuntimeError, match="Firebase Admin requiere credenciales"):
        service_account_info_from_settings(settings)
