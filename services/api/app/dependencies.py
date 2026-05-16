from fastapi import Request

from app.core.timeouts import run_with_wall_timeout
from app.repositories.base import InventoryRepository
from app.repositories.degraded_repository import DegradedInventoryRepository


REPOSITORY_FACTORY_TIMEOUT_SECONDS = 4.0


def get_repository(request: Request) -> InventoryRepository:
    repository = request.app.state.repository
    if repository is None:
        repository = run_with_wall_timeout(
            request.app.state.repository_factory,
            default=None,
            context="firestore repository factory",
            timeout_seconds=REPOSITORY_FACTORY_TIMEOUT_SECONDS,
        )
        if repository is None:
            return DegradedInventoryRepository()
        request.app.state.repository = repository
    return repository
