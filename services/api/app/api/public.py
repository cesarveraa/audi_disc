from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_repository
from app.domain.mappers import normalize_catalog_product_doc
from app.domain.schemas import CatalogProductResponse
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/products", response_model=list[CatalogProductResponse])
def list_public_products(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    q: Annotated[str | None, Query(max_length=120)] = None,
    marca: Annotated[str | None, Query(max_length=80)] = None,
) -> list[dict]:
    products = repository.list_products(estado=True, query=q, include_financials=False)
    normalized_brand = marca.casefold().strip() if marca else None
    public_products = []

    for product in products:
        if int(product.get("cantidad", 0)) <= 0:
            continue
        if normalized_brand and (product.get("marca") or "").casefold().strip() != normalized_brand:
            continue
        public_products.append(normalize_catalog_product_doc(product))

    return public_products
