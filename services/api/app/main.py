import logging
import sys
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analytics, audit, customers, dashboard, health, inventory, me, notifications, products, public, reports, sales
from app.core.config import get_settings
from app.core.security import firebase_auth_middleware
from app.repositories.base import InventoryRepository
from app.repositories.firestore_repository import FirestoreInventoryRepository

logger = logging.getLogger("audidisc.api")


def configure_logging() -> None:
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s"))
        root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def create_app(repository: InventoryRepository | None = None) -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title="Audi Disc API", version="0.1.0")
    app.state.repository = repository
    app.state.repository_factory = FirestoreInventoryRepository

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        return response

    app.middleware("http")(firebase_auth_middleware)

    @app.middleware("http")
    async def request_logger(request, call_next):
        start = time.perf_counter()
        message = "OK"
        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
            message = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "[%s] [%s] [500] - [%s] duration_ms=%s",
                request.method,
                request.url.path,
                message,
                elapsed_ms,
            )
            raise

        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        if response.status_code >= 400:
            message = response.headers.get("X-Error-Message", "HTTP error")
        logger.info(
            "[%s] [%s] [%s] - [%s] duration_ms=%s",
            request.method,
            request.url.path,
            response.status_code,
            message,
            elapsed_ms,
        )
        return response

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(inventory.router)
    app.include_router(products.router)
    app.include_router(customers.router)
    app.include_router(sales.router)
    app.include_router(reports.router)
    app.include_router(audit.router)
    app.include_router(analytics.router)
    app.include_router(dashboard.router)
    app.include_router(notifications.router)
    api_v1_prefix = "/api/v1"
    app.include_router(me.router, prefix=api_v1_prefix)
    app.include_router(inventory.router, prefix=api_v1_prefix)
    app.include_router(products.router, prefix=api_v1_prefix)
    app.include_router(customers.router, prefix=api_v1_prefix)
    app.include_router(sales.router, prefix=api_v1_prefix)
    app.include_router(reports.router, prefix=api_v1_prefix)
    app.include_router(audit.router, prefix=api_v1_prefix)
    app.include_router(analytics.router, prefix=api_v1_prefix)
    app.include_router(dashboard.router, prefix=api_v1_prefix)
    app.include_router(notifications.router, prefix=api_v1_prefix)
    app.include_router(public.router, prefix=api_v1_prefix)
    return app


app = create_app()
