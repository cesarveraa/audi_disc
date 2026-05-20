from __future__ import annotations

import math
from datetime import date
from typing import Iterable

import numpy as np
import pandas as pd


LOOKBACK_DAYS = 90
AUTONOMIA_CAP_DAYS = 999
DEAD_STOCK_AUTONOMIA_DAYS = 120
LOW_ROI_PERCENT = 20
HEATMAP_HOURS = list(range(9, 22))
WEEKDAY_LABELS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]


PRODUCT_COLUMNS = [
    "productoId",
    "nombre",
    "marca",
    "categoria",
    "stockActual",
    "precioCompraCentavos",
    "precioVentaCentavos",
]
SALE_COLUMNS = [
    "ventaId",
    "fechaLocal",
    "horaLocal",
    "metodo",
    "totalCentavos",
    "utilidadCentavos",
    "fecha",
]
LINE_COLUMNS = [
    "ventaId",
    "productoId",
    "nombre",
    "marca",
    "categoria",
    "cantidad",
    "precioListaCentavos",
    "precioVendidoCentavos",
    "subtotalCentavos",
    "precioCompraCentavos",
    "utilidadCentavos",
    "fechaLocal",
    "horaLocal",
    "metodo",
    "fecha",
]


def _as_int(value: object, default: int = 0) -> int:
    try:
        if value is None or pd.isna(value):
            return default
        return int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return default


def _as_float(value: object, digits: int = 2, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError):
        return default
    if not math.isfinite(numeric):
        return default
    return round(numeric, digits)


def _optional_float(value: object, digits: int = 2) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(numeric):
        return None
    return round(numeric, digits)


def _optional_int(value: object) -> int | None:
    try:
        if value is None or pd.isna(value):
            return None
        numeric = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return None
    return numeric if math.isfinite(numeric) else None


def _timestamp_iso(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    timestamp = pd.Timestamp(value)
    if pd.isna(timestamp):
        return None
    return timestamp.date().isoformat()


def _generated_at(today: date) -> str:
    return f"{today.isoformat()}T00:00:00"


def _hour_from_time(value: object) -> int | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    hour_text = raw.split(":", 1)[0]
    try:
        return int(hour_text)
    except ValueError:
        return None


def _commission_rate(method: object) -> float:
    normalized = str(method or "").casefold()
    if any(token in normalized for token in ("tarjeta", "credito", "debito", "visa", "mastercard", "card")):
        return 0.03
    return 0.0


def _product_frame(product_documents: Iterable[tuple[str, dict]]) -> pd.DataFrame:
    rows = []
    for product_id, product in product_documents:
        if not bool(product.get("estado", True)):
            continue
        rows.append(
            {
                "productoId": str(product_id),
                "nombre": str(product.get("nombre") or "Sin nombre"),
                "marca": product.get("marca"),
                "categoria": product.get("categoria") or "Sin categoria",
                "stockActual": _as_int(product.get("cantidad")),
                "precioCompraCentavos": _as_int(product.get("precioCompraCentavos")),
                "precioVentaCentavos": _as_int(product.get("precioVentaCentavos")),
            }
        )

    products = pd.DataFrame(rows, columns=PRODUCT_COLUMNS)
    if products.empty:
        return products
    for column in ("stockActual", "precioCompraCentavos", "precioVentaCentavos"):
        products[column] = pd.to_numeric(products[column], errors="coerce").fillna(0).astype("int64")
    return products


def _sales_frames(sale_documents: Iterable[tuple[str, dict]]) -> tuple[pd.DataFrame, pd.DataFrame]:
    sales_rows = []
    line_rows = []
    for sale_id, sale in sale_documents:
        if not bool(sale.get("estado", True)):
            continue
        products = sale.get("productos") or []
        sale_profit = sum(_as_int(item.get("utilidadCentavos")) for item in products if isinstance(item, dict))
        sale_row = {
            "ventaId": str(sale_id),
            "fechaLocal": str(sale.get("fechaLocal") or ""),
            "horaLocal": str(sale.get("horaLocal") or ""),
            "metodo": sale.get("metodo") or "Efectivo",
            "totalCentavos": _as_int(sale.get("totalCentavos")),
            "utilidadCentavos": sale_profit,
        }
        sales_rows.append(sale_row)

        for item in products:
            if not isinstance(item, dict):
                continue
            quantity = _as_int(item.get("cantidad"))
            if quantity <= 0:
                continue
            list_unit = _as_int(item.get("precioVentaCentavos") or item.get("precioVendidoCentavos"))
            sold_unit = _as_int(item.get("precioVendidoCentavos") or item.get("precioVentaCentavos"))
            subtotal = _as_int(item.get("subtotalCentavos"), sold_unit * quantity)
            purchase_unit = _as_int(item.get("precioCompraCentavos"))
            profit = _as_int(item.get("utilidadCentavos"), subtotal - (purchase_unit * quantity))
            product_id = str(item.get("productoId") or item.get("nombre") or "sin-producto")
            line_rows.append(
                {
                    "ventaId": str(sale_id),
                    "productoId": product_id,
                    "nombre": str(item.get("nombre") or "Sin nombre"),
                    "marca": item.get("marca"),
                    "categoria": item.get("categoria") or "Sin categoria",
                    "cantidad": quantity,
                    "precioListaCentavos": list_unit,
                    "precioVendidoCentavos": sold_unit,
                    "subtotalCentavos": subtotal,
                    "precioCompraCentavos": purchase_unit,
                    "utilidadCentavos": profit,
                    "fechaLocal": sale_row["fechaLocal"],
                    "horaLocal": sale_row["horaLocal"],
                    "metodo": sale_row["metodo"],
                }
            )

    sales = pd.DataFrame(sales_rows, columns=[column for column in SALE_COLUMNS if column != "fecha"])
    lines = pd.DataFrame(line_rows, columns=[column for column in LINE_COLUMNS if column != "fecha"])
    if sales.empty:
        return pd.DataFrame(columns=SALE_COLUMNS), pd.DataFrame(columns=LINE_COLUMNS)

    sales["fecha"] = pd.to_datetime(sales["fechaLocal"], errors="coerce")
    if lines.empty:
        lines = pd.DataFrame(columns=LINE_COLUMNS)
    else:
        lines["fecha"] = pd.to_datetime(lines["fechaLocal"], errors="coerce")
        numeric_columns = [
            "cantidad",
            "precioListaCentavos",
            "precioVendidoCentavos",
            "subtotalCentavos",
            "precioCompraCentavos",
            "utilidadCentavos",
        ]
        for column in numeric_columns:
            lines[column] = pd.to_numeric(lines[column], errors="coerce").fillna(0).astype("int64")
    return sales, lines


def build_inventory_health(
    product_documents: Iterable[tuple[str, dict]],
    sale_documents: Iterable[tuple[str, dict]],
    *,
    today: date,
) -> dict:
    products = _product_frame(product_documents)
    _sales, lines = _sales_frames(sale_documents)
    if products.empty:
        return {
            "generatedAt": _generated_at(today),
            "lookbackDias": LOOKBACK_DAYS,
            "thresholds": {
                "autonomiaAltaDias": DEAD_STOCK_AUTONOMIA_DAYS,
                "roiBajoPorcentaje": LOW_ROI_PERCENT,
                "autonomiaCapDias": AUTONOMIA_CAP_DAYS,
            },
            "totalProductos": 0,
            "items": [],
        }

    if lines.empty:
        historical = pd.DataFrame(columns=["productoId", "cantidadVendidaTotal", "ingresoHistoricoCentavos", "utilidadHistoricaCentavos", "ultimaVenta"])
        demand = pd.DataFrame(columns=["productoId", "cantidadVendida90"])
    else:
        historical = (
            lines.groupby("productoId", as_index=False)
            .agg(
                cantidadVendidaTotal=("cantidad", "sum"),
                ingresoHistoricoCentavos=("subtotalCentavos", "sum"),
                utilidadHistoricaCentavos=("utilidadCentavos", "sum"),
                ultimaVenta=("fecha", "max"),
            )
        )
        lookback_start = pd.Timestamp(today) - pd.Timedelta(days=LOOKBACK_DAYS)
        demand = (
            lines.loc[lines["fecha"] >= lookback_start]
            .groupby("productoId", as_index=False)
            .agg(cantidadVendida90=("cantidad", "sum"))
        )

    merged = products.merge(historical, how="left", on="productoId").merge(demand, how="left", on="productoId")
    for column in (
        "cantidadVendidaTotal",
        "ingresoHistoricoCentavos",
        "utilidadHistoricaCentavos",
        "cantidadVendida90",
    ):
        merged[column] = pd.to_numeric(merged[column], errors="coerce").fillna(0)
    merged["ultimaVenta"] = pd.to_datetime(merged["ultimaVenta"], errors="coerce")

    merged["velocidadVentaDiaria"] = merged["cantidadVendida90"] / LOOKBACK_DAYS
    merged["capitalInmovilizadoCentavos"] = merged["precioCompraCentavos"] * merged["stockActual"]
    merged["roiInventarioPorcentaje"] = np.where(
        merged["capitalInmovilizadoCentavos"] > 0,
        (merged["utilidadHistoricaCentavos"] / merged["capitalInmovilizadoCentavos"]) * 100,
        0,
    )
    autonomia_raw = np.where(
        merged["velocidadVentaDiaria"] > 0,
        merged["stockActual"] / merged["velocidadVentaDiaria"],
        np.where(merged["stockActual"] > 0, np.inf, 0),
    )
    merged["autonomiaDiasRaw"] = autonomia_raw
    merged["autonomiaDias"] = np.minimum(np.nan_to_num(autonomia_raw, posinf=AUTONOMIA_CAP_DAYS), AUTONOMIA_CAP_DAYS)
    merged["recenciaDias"] = (pd.Timestamp(today) - merged["ultimaVenta"]).dt.days
    merged["sinDemanda90"] = merged["cantidadVendida90"] <= 0
    merged["isDeadStockRisk"] = (
        (merged["stockActual"] > 0)
        & (merged["autonomiaDias"] >= DEAD_STOCK_AUTONOMIA_DAYS)
        & (merged["roiInventarioPorcentaje"] <= LOW_ROI_PERCENT)
    )

    conditions = [
        merged["stockActual"] <= 0,
        (merged["autonomiaDias"] < DEAD_STOCK_AUTONOMIA_DAYS) & (merged["roiInventarioPorcentaje"] >= LOW_ROI_PERCENT),
        (merged["autonomiaDias"] < DEAD_STOCK_AUTONOMIA_DAYS) & (merged["roiInventarioPorcentaje"] < LOW_ROI_PERCENT),
        (merged["autonomiaDias"] >= DEAD_STOCK_AUTONOMIA_DAYS) & (merged["roiInventarioPorcentaje"] >= LOW_ROI_PERCENT),
    ]
    merged["quadrant"] = np.select(
        conditions,
        ["sin-stock", "motores-rentabilidad", "generadores-trafico", "capital-estancado-rentable"],
        default="stock-muerto-riesgo",
    )
    merged = merged.sort_values(["isDeadStockRisk", "capitalInmovilizadoCentavos"], ascending=[False, False])

    items = []
    for row in merged.to_dict("records"):
        recencia = _optional_int(row.get("recenciaDias"))
        if bool(row.get("isDeadStockRisk")):
            color_status = "dead-stock"
        elif recencia is None:
            color_status = "never-sold"
        elif recencia >= 60:
            color_status = "stale"
        elif recencia >= 30:
            color_status = "watch"
        else:
            color_status = "healthy"

        items.append(
            {
                "productoId": row["productoId"],
                "nombre": row["nombre"],
                "marca": row.get("marca"),
                "categoria": row.get("categoria"),
                "stockActual": _as_int(row.get("stockActual")),
                "autonomiaDias": _as_float(row.get("autonomiaDias"), 2),
                "autonomiaDiasRaw": _optional_float(row.get("autonomiaDiasRaw"), 2),
                "velocidadVentaDiaria": _as_float(row.get("velocidadVentaDiaria"), 4),
                "roiInventarioPorcentaje": _as_float(row.get("roiInventarioPorcentaje"), 2),
                "capitalInmovilizadoCentavos": _as_int(row.get("capitalInmovilizadoCentavos")),
                "recenciaDias": recencia,
                "ultimaVentaFecha": _timestamp_iso(row.get("ultimaVenta")),
                "cantidadVendida90": _as_int(row.get("cantidadVendida90")),
                "cantidadVendidaTotal": _as_int(row.get("cantidadVendidaTotal")),
                "utilidadHistoricaCentavos": _as_int(row.get("utilidadHistoricaCentavos")),
                "quadrant": row.get("quadrant"),
                "colorStatus": color_status,
                "sinDemanda90": bool(row.get("sinDemanda90")),
                "isDeadStockRisk": bool(row.get("isDeadStockRisk")),
            }
        )

    return {
        "generatedAt": _generated_at(today),
        "lookbackDias": LOOKBACK_DAYS,
        "thresholds": {
            "autonomiaAltaDias": DEAD_STOCK_AUTONOMIA_DAYS,
            "roiBajoPorcentaje": LOW_ROI_PERCENT,
            "autonomiaCapDias": AUTONOMIA_CAP_DAYS,
        },
        "totalProductos": len(items),
        "items": items,
    }


def build_pareto_margin(
    product_documents: Iterable[tuple[str, dict]],
    sale_documents: Iterable[tuple[str, dict]],
    *,
    today: date,
) -> dict:
    products = _product_frame(product_documents)
    _sales, lines = _sales_frames(sale_documents)
    if lines.empty:
        return {
            "generatedAt": _generated_at(today),
            "totalIngresosCentavos": 0,
            "totalUtilidadCentavos": 0,
            "items": [],
        }

    if not products.empty:
        category_lookup = products[["productoId", "categoria"]].rename(columns={"categoria": "categoriaProducto"})
        lines = lines.merge(category_lookup, how="left", on="productoId")
        lines["categoria"] = lines["categoria"].where(lines["categoria"].ne("Sin categoria"), lines["categoriaProducto"])
    lines["categoria"] = lines["categoria"].fillna("Sin categoria")

    grouped = (
        lines.groupby("categoria", as_index=False)
        .agg(
            ingresosCentavos=("subtotalCentavos", "sum"),
            utilidadCentavos=("utilidadCentavos", "sum"),
            cantidadVendida=("cantidad", "sum"),
            tickets=("ventaId", "nunique"),
        )
    )
    total_revenue = int(grouped["ingresosCentavos"].sum())
    total_profit = int(grouped["utilidadCentavos"].sum())
    grouped["utilidadClasificacionCentavos"] = grouped["utilidadCentavos"].clip(lower=0)
    total_positive_profit = int(grouped["utilidadClasificacionCentavos"].sum())
    grouped = grouped.sort_values(["utilidadCentavos", "ingresosCentavos"], ascending=[False, False])
    grouped["ingresoPorcentaje"] = np.where(total_revenue > 0, (grouped["ingresosCentavos"] / total_revenue) * 100, 0)
    grouped["margenGananciaPorcentaje"] = np.where(
        grouped["ingresosCentavos"] > 0,
        (grouped["utilidadCentavos"] / grouped["ingresosCentavos"]) * 100,
        0,
    )
    grouped["utilidadPorcentaje"] = np.where(
        total_positive_profit > 0,
        (grouped["utilidadClasificacionCentavos"] / total_positive_profit) * 100,
        0,
    )
    grouped["cumulativeUtilidadPorcentaje"] = grouped["utilidadPorcentaje"].cumsum()
    grouped["previousCumulativeUtilidadPorcentaje"] = grouped["cumulativeUtilidadPorcentaje"] - grouped["utilidadPorcentaje"]
    max_revenue_share = float(grouped["ingresoPorcentaje"].max()) if len(grouped) else 0.0
    grouped["volumenRelativo"] = np.where(max_revenue_share > 0, grouped["ingresoPorcentaje"] / max_revenue_share, 0)

    items = []
    for row in grouped.to_dict("records"):
        previous = _as_float(row.get("previousCumulativeUtilidadPorcentaje"), 2)
        pareto_class = "A" if previous < 80 else "B" if previous < 95 else "C"
        if total_positive_profit <= 0:
            pareto_class = "C"
        items.append(
            {
                "categoria": row["categoria"],
                "ingresosCentavos": _as_int(row.get("ingresosCentavos")),
                "utilidadCentavos": _as_int(row.get("utilidadCentavos")),
                "cantidadVendida": _as_int(row.get("cantidadVendida")),
                "tickets": _as_int(row.get("tickets")),
                "ingresoPorcentaje": _as_float(row.get("ingresoPorcentaje"), 2),
                "margenGananciaPorcentaje": _as_float(row.get("margenGananciaPorcentaje"), 2),
                "utilidadPorcentaje": _as_float(row.get("utilidadPorcentaje"), 2),
                "cumulativeUtilidadPorcentaje": _as_float(row.get("cumulativeUtilidadPorcentaje"), 2),
                "volumenRelativo": _as_float(row.get("volumenRelativo"), 4),
                "paretoClass": pareto_class,
            }
        )

    return {
        "generatedAt": _generated_at(today),
        "totalIngresosCentavos": total_revenue,
        "totalUtilidadCentavos": total_profit,
        "items": items,
    }


def build_price_waterfall(
    sale_documents: Iterable[tuple[str, dict]],
    *,
    today: date,
) -> dict:
    _sales, lines = _sales_frames(sale_documents)
    month_key = today.strftime("%Y-%m")
    if lines.empty:
        monthly_lines = lines
    else:
        monthly_lines = lines.loc[lines["fecha"].dt.strftime("%Y-%m") == month_key].copy()

    if monthly_lines.empty:
        potential = discount = commission = cogs = actual = net = 0
    else:
        potential_series = monthly_lines["precioListaCentavos"].where(
            monthly_lines["precioListaCentavos"] > 0,
            monthly_lines["precioVendidoCentavos"],
        ) * monthly_lines["cantidad"]
        actual_series = monthly_lines["subtotalCentavos"].where(
            monthly_lines["subtotalCentavos"] > 0,
            monthly_lines["precioVendidoCentavos"] * monthly_lines["cantidad"],
        )
        discount_series = (potential_series - actual_series).clip(lower=0)
        commission_series = actual_series * monthly_lines["metodo"].map(_commission_rate)

        potential = int(round(float(potential_series.sum())))
        actual = int(round(float(actual_series.sum())))
        discount = int(round(float(discount_series.sum())))
        commission = int(round(float(commission_series.sum())))
        cogs = int(round(float((monthly_lines["precioCompraCentavos"] * monthly_lines["cantidad"]).sum())))
        net = actual - commission - cogs

    steps_config = [
        ("ingreso-potencial", "Ingreso potencial", potential, "anchor"),
        ("descuentos-pos", "Descuentos POS", -discount, "negative"),
        ("comisiones-pago", "Comisiones pago", -commission, "negative"),
        ("cogs", "COGS", -cogs, "negative"),
    ]
    steps = []
    cumulative = 0
    for step_id, label, delta, kind in steps_config:
        if kind == "anchor":
            start = 0
            end = delta
            cumulative = end
        else:
            start = cumulative
            end = cumulative + delta
            cumulative = end
        steps.append(
            {
                "id": step_id,
                "label": label,
                "kind": kind,
                "deltaCentavos": int(delta),
                "startCentavos": int(min(start, end)),
                "endCentavos": int(max(start, end)),
                "runningTotalCentavos": int(cumulative),
            }
        )

    steps.append(
        {
            "id": "utilidad-neta",
            "label": "Utilidad neta",
            "kind": "total",
            "deltaCentavos": int(net),
            "startCentavos": int(min(0, net)),
            "endCentavos": int(max(0, net)),
            "runningTotalCentavos": int(net),
        }
    )

    return {
        "generatedAt": _generated_at(today),
        "month": month_key,
        "summary": {
            "ingresoPotencialCentavos": potential,
            "ingresoRealCentavos": actual,
            "descuentosCentavos": discount,
            "comisionesCentavos": commission,
            "cogsCentavos": cogs,
            "utilidadNetaCentavos": net,
        },
        "steps": steps,
    }


def build_sales_heatmap(
    sale_documents: Iterable[tuple[str, dict]],
    *,
    today: date,
) -> dict:
    sales, _lines = _sales_frames(sale_documents)
    if sales.empty:
        grouped = pd.DataFrame(columns=["weekday", "hora", "tickets", "utilidadCentavos", "totalCentavos"])
    else:
        sales = sales.copy()
        sales["hora"] = sales["horaLocal"].map(_hour_from_time)
        sales = sales.loc[sales["fecha"].notna() & sales["hora"].between(HEATMAP_HOURS[0], HEATMAP_HOURS[-1], inclusive="both")]
        if sales.empty:
            grouped = pd.DataFrame(columns=["weekday", "hora", "tickets", "utilidadCentavos", "totalCentavos"])
        else:
            sales["weekday"] = sales["fecha"].dt.weekday
            grouped = (
                sales.groupby(["weekday", "hora"], as_index=False)
                .agg(
                    tickets=("ventaId", "count"),
                    utilidadCentavos=("utilidadCentavos", "sum"),
                    totalCentavos=("totalCentavos", "sum"),
                )
            )

    full_index = pd.MultiIndex.from_product([range(7), HEATMAP_HOURS], names=["weekday", "hora"])
    grouped = grouped.set_index(["weekday", "hora"]).reindex(full_index, fill_value=0).reset_index()
    max_tickets = int(grouped["tickets"].max()) if len(grouped) else 0
    max_profit = int(grouped["utilidadCentavos"].max()) if len(grouped) else 0

    rows = []
    for weekday, label in enumerate(WEEKDAY_LABELS):
        subset = grouped.loc[grouped["weekday"] == weekday].sort_values("hora")
        rows.append(
            {
                "id": label,
                "data": [
                    {
                        "x": f"{int(row['hora']):02d}:00",
                        "y": _as_int(row["tickets"]),
                        "tickets": _as_int(row["tickets"]),
                        "utilidadCentavos": _as_int(row["utilidadCentavos"]),
                        "totalCentavos": _as_int(row["totalCentavos"]),
                    }
                    for row in subset.to_dict("records")
                ],
            }
        )

    return {
        "generatedAt": _generated_at(today),
        "hours": [f"{hour:02d}:00" for hour in HEATMAP_HOURS],
        "weekdays": WEEKDAY_LABELS,
        "maxTickets": max_tickets,
        "maxUtilidadCentavos": max_profit,
        "data": rows,
    }
