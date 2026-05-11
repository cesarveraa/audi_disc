from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.security import AuthenticatedUser, get_current_user, require_admin
from app.dependencies import get_repository
from app.domain.schemas import SaleCreate
from app.repositories.base import InventoryRepository
from app.services.pdf_documents import sale_receipt_pdf

router = APIRouter(tags=["sales"])


@router.post("/sales", status_code=status.HTTP_201_CREATED)
@router.post("/ventas", status_code=status.HTTP_201_CREATED)
def create_sale(
    payload: SaleCreate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.create_sale(payload, user, include_financials=user.is_admin)


@router.post("/sales/{sale_id}/void")
@router.post("/ventas/{sale_id}/void")
def void_sale(
    sale_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
) -> dict:
    return repository.void_sale(sale_id, user, include_financials=True)


@router.get("/sales/{sale_id}/receipt.pdf")
@router.get("/ventas/{sale_id}/recibo.pdf")
def sale_receipt(
    sale_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> Response:
    sale = repository.get_sale(sale_id, include_financials=user.is_admin)
    pdf = sale_receipt_pdf(sale)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="audi-disc-recibo-{sale_id}.pdf"'},
    )


@router.get("/sales/history")
@router.get("/ventas/history")
def sales_history(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    dateFrom: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
    dateTo: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
) -> dict:
    return repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=user.is_admin)
