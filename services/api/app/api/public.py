import hashlib
import json
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.dependencies import get_repository
from app.domain.mappers import normalize_catalog_product_doc
from app.domain.schemas import CatalogProductsPageResponse
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/public", tags=["public"])

CATALOG_CACHE_TTL_SECONDS = 60
CATALOG_CACHE_HEADERS = "public, max-age=60, s-maxage=120, stale-while-revalidate=600"
_catalog_cache: dict[str, tuple[float, dict, str]] = {}


def _cache_key(*, page: int, limit: int, q: str | None, marca: str | None, categoria: str | None) -> str:
    return json.dumps(
        {
            "page": page,
            "limit": limit,
            "q": (q or "").strip().casefold(),
            "marca": (marca or "").strip().casefold(),
            "categoria": (categoria or "").strip().casefold(),
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def _etag(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return f'W/"{hashlib.sha256(raw).hexdigest()[:24]}"'


def _set_catalog_headers(response: Response, etag: str) -> None:
    response.headers["Cache-Control"] = CATALOG_CACHE_HEADERS
    response.headers["ETag"] = etag
    response.headers["Vary"] = "Accept-Encoding"


@router.get("/products", response_model=CatalogProductsPageResponse)
def list_public_products(
    request: Request,
    response: Response,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    q: Annotated[str | None, Query(max_length=120)] = None,
    marca: Annotated[str | None, Query(max_length=80)] = None,
    categoria: Annotated[str | None, Query(max_length=80)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict | Response:
    key = _cache_key(page=page, limit=limit, q=q, marca=marca, categoria=categoria)
    cached = _catalog_cache.get(key)
    now = time.time()
    if cached and cached[0] > now:
        _, payload, etag = cached
        _set_catalog_headers(response, etag)
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=dict(response.headers))
        return payload

    paginated = repository.list_catalog_products(page=page, limit=limit, query=q, marca=marca, categoria=categoria)
    payload = {
        "items": [normalize_catalog_product_doc(product) for product in paginated["items"]],
        "total_count": int(paginated["total_count"]),
        "has_more": bool(paginated["has_more"]),
    }
    etag = _etag(payload)
    _catalog_cache[key] = (now + CATALOG_CACHE_TTL_SECONDS, payload, etag)
    _set_catalog_headers(response, etag)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=dict(response.headers))
    return payload
