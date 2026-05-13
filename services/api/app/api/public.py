from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_repository
from app.domain.mappers import normalize_catalog_product_doc
from app.domain.schemas import CatalogProductsPageResponse
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/products", response_model=CatalogProductsPageResponse)
def list_public_products(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    q: Annotated[str | None, Query(max_length=120)] = None,
    marca: Annotated[str | None, Query(max_length=80)] = None,
    categoria: Annotated[str | None, Query(max_length=80)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict:
    paginated = repository.list_catalog_products(
        page=page,
        limit=limit,
        query=q,
        marca=marca,
        categoria=categoria,
    )
    return {
        "items": [normalize_catalog_product_doc(product) for product in paginated["items"]],
        "total_count": int(paginated["total_count"]),
        "has_more": bool(paginated["has_more"]),
    }
