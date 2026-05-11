from app.domain.schemas import datetime_to_iso


PUBLIC_PRODUCT_KEYS = {
    "id",
    "nombre",
    "marca",
    "sku",
    "categoria",
    "cantidad",
    "stockMinimo",
    "precioVentaCentavos",
    "estado",
    "createdAt",
    "updatedAt",
}


def calculate_margin_percent(precio_compra: int, precio_venta: int) -> float:
    if precio_venta <= 0:
        return 0.0
    return round(((precio_venta - precio_compra) / precio_venta) * 100, 2)


def normalize_product_doc(product_id: str, data: dict, include_financials: bool) -> dict:
    precio_compra = int(data.get("precioCompraCentavos", 0))
    precio_venta = int(data.get("precioVentaCentavos", 0))
    product = {
        "id": product_id,
        "nombre": data.get("nombre", ""),
        "marca": data.get("marca"),
        "sku": data.get("sku"),
        "categoria": data.get("categoria"),
        "cantidad": int(data.get("cantidad", 0)),
        "stockMinimo": int(data.get("stockMinimo", 0)),
        "precioVentaCentavos": precio_venta,
        "estado": bool(data.get("estado", True)),
        "createdAt": datetime_to_iso(data.get("createdAt")),
        "updatedAt": datetime_to_iso(data.get("updatedAt")),
    }
    if include_financials:
        product["precioCompraCentavos"] = precio_compra
        product["utilidadCentavos"] = precio_venta - precio_compra
        product["margenPorcentaje"] = calculate_margin_percent(precio_compra, precio_venta)
    return product


def normalize_customer_doc(customer_id: str, data: dict) -> dict:
    return {
        "id": customer_id,
        "nombre": data.get("nombre", ""),
        "telefono": data.get("telefono", ""),
        "estado": bool(data.get("estado", True)),
        "comprasCount": int(data.get("comprasCount", 0)),
        "totalCompradoCentavos": int(data.get("totalCompradoCentavos", 0)),
        "ultimaCompraAt": datetime_to_iso(data.get("ultimaCompraAt")),
        "createdAt": datetime_to_iso(data.get("createdAt")),
        "updatedAt": datetime_to_iso(data.get("updatedAt")),
    }


def normalize_inventory_log_doc(log_id: str, data: dict) -> dict:
    return {
        "id": log_id,
        "productoId": data.get("productoId", ""),
        "productoNombre": data.get("productoNombre", ""),
        "tipo": data.get("tipo", "ajuste"),
        "cantidadAnterior": int(data.get("cantidadAnterior", 0)),
        "cantidadDelta": int(data.get("cantidadDelta", 0)),
        "cantidadNueva": int(data.get("cantidadNueva", 0)),
        "motivo": data.get("motivo"),
        "referencia": data.get("referencia"),
        "createdBy": data.get("createdBy", ""),
        "createdAt": datetime_to_iso(data.get("createdAt")),
    }


def strip_sale_financials(sale: dict, include_financials: bool) -> dict:
    if include_financials:
        return sale

    clean_items = []
    for item in sale["productos"]:
        clean = dict(item)
        clean.pop("precioCompraCentavos", None)
        clean.pop("utilidadCentavos", None)
        clean_items.append(clean)

    clean_sale = dict(sale)
    clean_sale["productos"] = clean_items
    return clean_sale
