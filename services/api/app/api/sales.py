from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.security import AuthenticatedUser, get_current_user, require_permission
from app.dependencies import get_repository
from app.domain.schemas import SaleCreate
from app.repositories.base import InventoryRepository
from app.services.pdf_documents import sale_receipt_pdf

router = APIRouter(tags=["sales"])


@router.post("/sales", status_code=status.HTTP_201_CREATED)
@router.post("/sales/checkout", status_code=status.HTTP_201_CREATED)
@router.post("/ventas", status_code=status.HTTP_201_CREATED)
def create_sale(
    payload: SaleCreate,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("sales"))],
) -> dict:
    return repository.create_sale(payload, user, include_financials=user.can_view_financials)


@router.post("/sales/{sale_id}/void")
@router.post("/ventas/{sale_id}/void")
def void_sale(
    sale_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("history"))],
) -> dict:
    return repository.void_sale(sale_id, user, include_financials=user.can_view_financials)


@router.get("/sales/{sale_id}/receipt.pdf")
@router.get("/ventas/{sale_id}/recibo.pdf")
def sale_receipt(
    sale_id: str,
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> Response:
    if not user.has_permission("history") and not user.has_permission("sales"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission required: sales or history")

    sale = repository.get_sale(sale_id, include_financials=user.can_view_financials)
    if not user.has_permission("history"):
        if sale.get("createdBy") != user.uid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sale receipt access denied")
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
    user: Annotated[AuthenticatedUser, Depends(require_permission("history"))],
    dateFrom: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
    dateTo: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
) -> dict:
    return repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=user.can_view_financials)
