from fastapi import Request

from app.repositories.base import InventoryRepository


def get_repository(request: Request) -> InventoryRepository:
    repository = request.app.state.repository
    if repository is None:
        repository = request.app.state.repository_factory()
        request.app.state.repository = repository
    return repository
