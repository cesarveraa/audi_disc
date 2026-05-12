from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AUDIDISC_",
        env_file=".env",
        extra="ignore",
    )

    env: str = "development"
    firebase_project_id: str | None = None
    firebase_service_account_json: str | None = None
    firebase_client_email: str | None = None
    firebase_private_key: str | None = None
    firebase_private_key_id: str | None = None
    firebase_client_id: str | None = None
    firebase_client_x509_cert_url: str | None = None
    firebase_auth_uri: str = "https://accounts.google.com/o/oauth2/auth"
    firebase_token_uri: str = "https://oauth2.googleapis.com/token"
    firebase_auth_provider_x509_cert_url: str = "https://www.googleapis.com/oauth2/v1/certs"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    timezone: str = Field(default="America/La_Paz")

    @property
    def cors_origin_list(self) -> list[str]:
        required_origins = {
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        }
        configured_origins = {origin.strip() for origin in self.cors_origins.split(",") if origin.strip()}
        return sorted(configured_origins | required_origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
