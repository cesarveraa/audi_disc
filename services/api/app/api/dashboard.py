from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, require_permission
from app.core.timeouts import run_with_wall_timeout
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
READ_TIMEOUT_SECONDS = 6.0
EMPTY_DASHBOARD = {
    "ventasHoy": {
        "totalCentavos": 0,
        "cantidadVentas": 0,
        "ticketPromedioCentavos": 0,
    },
    "stockBajo": [],
}


@router.get("/resumen-hoy")
def resumen_hoy(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("inventory"))],
) -> dict:
    return run_with_wall_timeout(
        repository.dashboard_summary,
        default=EMPTY_DASHBOARD,
        context="dashboard summary endpoint",
        timeout_seconds=READ_TIMEOUT_SECONDS,
    )
