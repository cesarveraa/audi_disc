from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import customers, dashboard, health, me, notifications, products, reports, sales
from app.core.config import get_settings
from app.repositories.base import InventoryRepository
from app.repositories.firestore_repository import FirestoreInventoryRepository


def create_app(repository: InventoryRepository | None = None) -> FastAPI:
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

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(products.router)
    app.include_router(customers.router)
    app.include_router(sales.router)
    app.include_router(reports.router)
    app.include_router(dashboard.router)
    app.include_router(notifications.router)
    return app


app = create_app()
