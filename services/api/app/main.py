import logging
import sys
import time

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api import access, analytics, audit, customers, dashboard, health, inventory, me, notifications, products, public, reports, sales
from app.core.config import get_settings
from app.core.rate_limit import RATE_LIMIT_RESPONSE_HEADERS, FixedWindowRateLimiter, apply_rate_limit, rate_limit_headers
from app.core.security import firebase_auth_middleware
from app.repositories.base import InventoryRepository
from app.repositories.firestore_repository import FirestoreInventoryRepository

logger = logging.getLogger("audidisc.api")
BRAND_MARK_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<rect width="96" height="96" rx="22" fill="#050505"/>
<circle cx="48" cy="48" r="31" fill="none" stroke="#fff" stroke-width="5"/>
<circle cx="48" cy="48" r="17" fill="none" stroke="#fff" stroke-width="5" opacity=".88"/>
<circle cx="48" cy="48" r="6" fill="#fff"/>
<circle cx="70" cy="18" r="8" fill="#E4002B"/>
<path d="M22 72 74 24" stroke="#fff" stroke-width="4" opacity=".62"/>
</svg>"""


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
    app = FastAPI(
        title="Audi Disc API",
        version="0.1.0",
        openapi_url=None if settings.is_production else "/openapi.json",
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
    )
    app.state.repository = repository
    app.state.repository_factory = FirestoreInventoryRepository
    app.state.rate_limiter = FixedWindowRateLimiter()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Authorization", "Content-Type", "If-None-Match"],
        expose_headers=["Cache-Control", "ETag", *RATE_LIMIT_RESPONSE_HEADERS],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = apply_rate_limit(request, settings)
        if response is None:
            response = await call_next(request)
            rate_limit_decision = getattr(request.state, "rate_limit_decision", None)
            if rate_limit_decision:
                response.headers.update(rate_limit_headers(rate_limit_decision))
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if request.url.path.startswith("/api/v1/public/"):
            response.headers.setdefault("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600")
        else:
            response.headers["Cache-Control"] = "no-store"
        return response

    app.middleware("http")(firebase_auth_middleware)

    @app.get("/", include_in_schema=False)
    def root_status() -> dict[str, str]:
        return {"service": "Audi Disc API", "status": "ok"}

    @app.get("/favicon.ico", include_in_schema=False)
    @app.get("/favicon.png", include_in_schema=False)
    @app.get("/audidisc.jpg", include_in_schema=False)
    @app.get("/logo.png", include_in_schema=False)
    @app.get("/logo.svg", include_in_schema=False)
    def brand_mark() -> Response:
        return Response(
            content=BRAND_MARK_SVG,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400, immutable"},
        )

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

        origin = request.headers.get("Origin")
        if origin and settings.is_cors_origin_allowed(origin) and "access-control-allow-origin" not in response.headers:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers.add_vary_header("Origin")

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
    app.include_router(access.router)
    api_v1_prefix = "/api/v1"
    app.include_router(health.router, prefix=api_v1_prefix)
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
    app.include_router(access.router, prefix=api_v1_prefix)
    app.include_router(public.router, prefix=api_v1_prefix)
    return app


app = create_app()
