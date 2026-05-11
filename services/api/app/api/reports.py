from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.security import AuthenticatedUser, get_current_user, require_admin
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository
from app.services.pdf_documents import cash_close_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
def reports_dashboard(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> dict:
    return repository.reports_dashboard(include_financials=user.is_admin)


@router.get("/cash-close.pdf")
def cash_close_report(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_admin)],
    dateFrom: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
    dateTo: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
) -> Response:
    history = repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=True)
    pdf = cash_close_pdf(history, user.uid)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="audi-disc-cierre-{dateFrom}-{dateTo}.pdf"'},
    )
