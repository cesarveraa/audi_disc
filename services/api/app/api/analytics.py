from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, require_permission
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/analytics", tags=["analytics"])
bi_router = APIRouter(prefix="/bi", tags=["advanced-bi"])


@router.get("/dashboard")
def analytics_dashboard(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("analytics"))],
) -> dict:
    return repository.analytics_dashboard()


@bi_router.get("/inventory-health")
def inventory_health(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("analytics"))],
) -> dict:
    return repository.inventory_health()


@bi_router.get("/pareto-margin")
def pareto_margin(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("analytics"))],
) -> dict:
    return repository.pareto_margin()


@bi_router.get("/price-waterfall")
def price_waterfall(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("analytics"))],
) -> dict:
    return repository.price_waterfall()


@bi_router.get("/sales-heatmap")
def sales_heatmap(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("analytics"))],
) -> dict:
    return repository.sales_heatmap()
