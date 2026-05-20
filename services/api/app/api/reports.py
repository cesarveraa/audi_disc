from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.security import AuthenticatedUser, require_permission
from app.dependencies import get_repository
from app.repositories.base import InventoryRepository
from app.services.pdf_documents import cash_close_pdf, products_inventory_pdf, sales_history_pdf
from app.services.spreadsheet_documents import products_inventory_xlsx, sales_history_xlsx

router = APIRouter(prefix="/reports", tags=["reports"])
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


def _normalize(value: object) -> str:
    return str(value or "").casefold().strip()


def _date_in_range(value: object, date_from: str | None, date_to: str | None) -> bool:
    if not date_from and not date_to:
        return True
    date_value = str(value or "")[:10]
    if not date_value:
        return False
    if date_from and date_value < date_from:
        return False
    return not (date_to and date_value > date_to)


def _product_stock_status(product: dict) -> str:
    if not product.get("estado", True):
        return "inactive"
    if int(product.get("cantidad", 0)) <= 0:
        return "critical"
    if int(product.get("cantidad", 0)) <= int(product.get("stockMinimo", 0)):
        return "low"
    return "healthy"


def _filter_products(
    products: list[dict],
    *,
    q: str | None,
    marca: str | None,
    categoria: str | None,
    stock: str,
    date_from: str | None,
    date_to: str | None,
) -> list[dict]:
    normalized_query = _normalize(q)
    normalized_brand = _normalize(marca)
    normalized_category = _normalize(categoria)
    normalized_stock = _normalize(stock)
    filtered = []
    for product in products:
        haystack = " ".join(
            str(product.get(field) or "")
            for field in ("id", "nombre", "marca", "sku", "categoria")
        ).casefold()
        if normalized_query and normalized_query not in haystack:
            continue
        if normalized_brand and normalized_brand not in _normalize(product.get("marca")):
            continue
        if normalized_category and normalized_category not in _normalize(product.get("categoria")):
            continue
        if normalized_stock and normalized_stock != "all" and _product_stock_status(product) != normalized_stock:
            continue
        if not _date_in_range(product.get("updatedAt") or product.get("createdAt"), date_from, date_to):
            continue
        filtered.append(product)
    return filtered


def _sale_item_matches(item: dict, product_query: str | None, product_id: str | None) -> bool:
    normalized_product_id = _normalize(product_id)
    if normalized_product_id and _normalize(item.get("productoId")) != normalized_product_id:
        return False
    normalized_query = _normalize(product_query)
    if not normalized_query:
        return True
    haystack = " ".join(
        str(item.get(field) or "")
        for field in ("productoId", "nombre", "marca", "sku", "categoria")
    ).casefold()
    return normalized_query in haystack


def _recalculate_sales_history(history: dict, sales: list[dict]) -> dict:
    total = sum(int(sale.get("totalCentavos", 0)) for sale in sales)
    utility = sum(
        int(item.get("utilidadCentavos", 0))
        for sale in sales
        for item in sale.get("productos", [])
    )
    history = dict(history)
    history["ventas"] = sales
    history["cantidadVentas"] = len(sales)
    history["totalCentavos"] = total
    if "utilidadCentavos" in history:
        history["utilidadCentavos"] = utility
        history["margenPorcentaje"] = round((utility / total) * 100, 2) if total else 0
    if "netoAntesImpuestoCentavos" in history:
        history["netoAntesImpuestoCentavos"] = round(total / 1.13) if total else 0
        history["impuestoEstimadoCentavos"] = total - history["netoAntesImpuestoCentavos"]
    return history


def _filter_sales_history(
    history: dict,
    *,
    product_query: str | None,
    product_id: str | None,
    metodo: str | None,
) -> dict:
    normalized_method = _normalize(metodo)
    item_filter_active = bool(_normalize(product_query) or _normalize(product_id))
    filtered_sales = []
    for sale in history.get("ventas", []):
        if normalized_method and _normalize(sale.get("metodo")) != normalized_method:
            continue
        if not item_filter_active:
            filtered_sales.append(sale)
            continue
        matching_items = [
            item
            for item in sale.get("productos", [])
            if _sale_item_matches(item, product_query, product_id)
        ]
        if not matching_items:
            continue
        filtered_sale = dict(sale)
        filtered_sale["productos"] = matching_items
        filtered_sale["totalCentavos"] = sum(int(item.get("subtotalCentavos", 0)) for item in matching_items)
        filtered_sales.append(filtered_sale)
    return _recalculate_sales_history(history, filtered_sales)


@router.get("/dashboard")
def reports_dashboard(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("reports"))],
) -> dict:
    return repository.reports_dashboard(include_financials=user.can_view_financials)


@router.get("/sales-history")
def filtered_sales_history(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("financials"))],
    dateFrom: Annotated[str, Query(pattern=DATE_PATTERN)],
    dateTo: Annotated[str, Query(pattern=DATE_PATTERN)],
    producto: Annotated[str | None, Query(max_length=120)] = None,
    productoId: Annotated[str | None, Query(max_length=120)] = None,
    metodo: Annotated[str | None, Query(max_length=40)] = None,
) -> dict:
    history = repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=True)
    return _filter_sales_history(history, product_query=producto, product_id=productoId, metodo=metodo)


@router.get("/cash-close.pdf")
def cash_close_report(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("financials"))],
    dateFrom: Annotated[str, Query(pattern=DATE_PATTERN)],
    dateTo: Annotated[str, Query(pattern=DATE_PATTERN)],
    producto: Annotated[str | None, Query(max_length=120)] = None,
    productoId: Annotated[str | None, Query(max_length=120)] = None,
    metodo: Annotated[str | None, Query(max_length=40)] = None,
) -> Response:
    history = repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=True)
    history = _filter_sales_history(history, product_query=producto, product_id=productoId, metodo=metodo)
    pdf = cash_close_pdf(history, user.uid)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="audi-disc-cierre-{dateFrom}-{dateTo}.pdf"'},
    )


@router.get("/products.xlsx")
def products_excel_report(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("financials"))],
    q: Annotated[str | None, Query(max_length=120)] = None,
    marca: Annotated[str | None, Query(max_length=80)] = None,
    categoria: Annotated[str | None, Query(max_length=80)] = None,
    estado: Annotated[bool | None, Query()] = True,
    stock: Annotated[str, Query(pattern=r"^(all|healthy|low|critical|inactive)$")] = "all",
    dateFrom: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
    dateTo: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
) -> Response:
    products = repository.list_products(estado=estado, query=q, include_financials=True)
    products = _filter_products(
        products,
        q=q,
        marca=marca,
        categoria=categoria,
        stock=stock,
        date_from=dateFrom,
        date_to=dateTo,
    )
    xlsx = products_inventory_xlsx(products)
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="audi-disc-productos.xlsx"'},
    )


@router.get("/products.pdf")
def products_pdf_report(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("financials"))],
    q: Annotated[str | None, Query(max_length=120)] = None,
    marca: Annotated[str | None, Query(max_length=80)] = None,
    categoria: Annotated[str | None, Query(max_length=80)] = None,
    estado: Annotated[bool | None, Query()] = True,
    stock: Annotated[str, Query(pattern=r"^(all|healthy|low|critical|inactive)$")] = "all",
    dateFrom: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
    dateTo: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
) -> Response:
    products = repository.list_products(estado=estado, query=q, include_financials=True)
    products = _filter_products(
        products,
        q=q,
        marca=marca,
        categoria=categoria,
        stock=stock,
        date_from=dateFrom,
        date_to=dateTo,
    )
    pdf = products_inventory_pdf(products, user.uid)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="audi-disc-productos.pdf"'},
    )


@router.get("/sales.xlsx")
def sales_excel_report(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    _user: Annotated[AuthenticatedUser, Depends(require_permission("financials"))],
    dateFrom: Annotated[str, Query(pattern=DATE_PATTERN)],
    dateTo: Annotated[str, Query(pattern=DATE_PATTERN)],
    producto: Annotated[str | None, Query(max_length=120)] = None,
    productoId: Annotated[str | None, Query(max_length=120)] = None,
    metodo: Annotated[str | None, Query(max_length=40)] = None,
) -> Response:
    history = repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=True)
    history = _filter_sales_history(history, product_query=producto, product_id=productoId, metodo=metodo)
    xlsx = sales_history_xlsx(history)
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="audi-disc-ventas-{dateFrom}-{dateTo}.xlsx"'},
    )


@router.get("/sales.pdf")
def sales_pdf_report(
    repository: Annotated[InventoryRepository, Depends(get_repository)],
    user: Annotated[AuthenticatedUser, Depends(require_permission("financials"))],
    dateFrom: Annotated[str, Query(pattern=DATE_PATTERN)],
    dateTo: Annotated[str, Query(pattern=DATE_PATTERN)],
    producto: Annotated[str | None, Query(max_length=120)] = None,
    productoId: Annotated[str | None, Query(max_length=120)] = None,
    metodo: Annotated[str | None, Query(max_length=40)] = None,
) -> Response:
    history = repository.sales_history(date_from=dateFrom, date_to=dateTo, include_financials=True)
    history = _filter_sales_history(history, product_query=producto, product_id=productoId, metodo=metodo)
    pdf = sales_history_pdf(history, user.uid)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="audi-disc-ventas-{dateFrom}-{dateTo}.pdf"'},
    )
