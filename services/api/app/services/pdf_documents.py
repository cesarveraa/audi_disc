from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


AUDI_RED = colors.HexColor("#E4002B")
INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#E5E7EB")
ROOT = Path(__file__).resolve().parents[4]
LOGO_PATH = ROOT / "apps" / "web" / "public" / "audidisc.jpg"


def format_bs(centavos: int) -> str:
    return f"Bs {centavos / 100:,.2f}"


def _styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="AudiTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            textColor=INK,
            leading=30,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="AudiEyebrow",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=AUDI_RED,
            leading=12,
            uppercase=True,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="AudiBody",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=MUTED,
            leading=15,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TicketTitle",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=INK,
            leading=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TicketBody",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            textColor=INK,
            leading=9,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TicketCenter",
            parent=styles["TicketBody"],
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TicketRight",
            parent=styles["TicketBody"],
            alignment=TA_RIGHT,
            fontName="Helvetica-Bold",
        )
    )
    return styles


def _logo(width: float, height: float) -> Image | None:
    if not LOGO_PATH.exists():
        return None
    logo = Image(str(LOGO_PATH), width=width, height=height)
    logo.hAlign = "CENTER"
    return logo


def _table(data: list[list[object]], widths: list[float]) -> Table:
    table = Table(data, colWidths=widths, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _ticket_table(data: list[list[object]], widths: list[float]) -> Table:
    table = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.3),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
                ("LINEABOVE", (0, -1), (-1, -1), 0.6, LINE),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _build_pdf(
    elements: list[object],
    *,
    pagesize: tuple[float, float] = letter,
    margin: float = 0.55 * inch,
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        rightMargin=margin,
        leftMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title="Audi Disc",
    )
    doc.build(elements)
    return buffer.getvalue()


def sale_receipt_pdf(sale: dict) -> bytes:
    styles = _styles()
    items = sale.get("productos", [])
    ticket_width = 80 * mm
    ticket_height = max(160 * mm, (112 + len(items) * 12) * mm)
    elements: list[object] = []

    logo = _logo(18 * mm, 18 * mm)
    if logo:
        elements.extend([logo, Spacer(1, 3 * mm)])

    elements.extend(
        [
            Paragraph("AUDI DISC", styles["TicketTitle"]),
            Paragraph("Recibo de Venta", styles["TicketCenter"]),
            Spacer(1, 3 * mm),
            Paragraph(f"Venta: {sale['id']}", styles["TicketBody"]),
            Paragraph(f"Fecha: {sale['fechaLocal']} {sale['horaLocal']}", styles["TicketBody"]),
            Paragraph(f"Metodo: {sale['metodo']}", styles["TicketBody"]),
            Spacer(1, 3 * mm),
        ]
    )

    rows: list[list[object]] = [["Producto", "Cant", "Subtotal"]]
    for item in items:
        rows.append(
            [
                Paragraph(str(item.get("nombre", "")), styles["TicketBody"]),
                int(item.get("cantidad", 0)),
                format_bs(int(item.get("subtotalCentavos", 0))),
            ]
        )
    elements.append(_ticket_table(rows, [39 * mm, 9 * mm, 22 * mm]))
    elements.append(Spacer(1, 3 * mm))

    totals = [
        ["Total", format_bs(int(sale.get("totalCentavos", 0)))],
        ["Recibido", format_bs(int(sale.get("recibidoCentavos", 0)))],
        ["Cambio", format_bs(int(sale.get("cambioCentavos", 0)))],
    ]
    total_table = Table(totals, colWidths=[40 * mm, 30 * mm], hAlign="CENTER")
    total_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("LINEABOVE", (0, 0), (-1, 0), 0.8, AUDI_RED),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(total_table)
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph("Gracias por su compra.", styles["TicketCenter"]))
    elements.append(Paragraph("Documento generado por Audi Disc.", styles["TicketCenter"]))
    return _build_pdf(elements, pagesize=(ticket_width, ticket_height), margin=4 * mm)


def _method_totals(history: dict) -> list[tuple[str, int, int]]:
    totals: dict[str, dict[str, int]] = {}
    for sale in history.get("ventas", []):
        method = str(sale.get("metodo") or "Sin metodo")
        if method not in totals:
            totals[method] = {"count": 0, "total": 0}
        totals[method]["count"] += 1
        totals[method]["total"] += int(sale.get("totalCentavos", 0))

    preferred = ["Efectivo", "Qr", "Transferencia"]
    ordered = [method for method in preferred if method in totals]
    ordered.extend(sorted(method for method in totals if method not in preferred))
    return [(method, totals[method]["count"], totals[method]["total"]) for method in ordered]


def cash_close_pdf(history: dict, user_uid: str) -> bytes:
    styles = _styles()
    elements: list[object] = []
    logo = _logo(0.55 * inch, 0.55 * inch)
    if logo:
        elements.append(logo)
        elements.append(Spacer(1, 0.12 * inch))

    elements.extend(
        [
            Paragraph("AUDI DISC", styles["AudiEyebrow"]),
            Paragraph("Reporte de Cierre de Caja", styles["AudiTitle"]),
            Paragraph(
                f"Rango {history['dateFrom']} a {history['dateTo']} / Generado por {user_uid}",
                styles["AudiBody"],
            ),
            Spacer(1, 0.22 * inch),
        ]
    )

    summary = [
        ["Total vendido", format_bs(int(history.get("totalCentavos", 0)))],
        ["Neto antes de impuesto", format_bs(int(history.get("netoAntesImpuestoCentavos", 0)))],
        ["Debito fiscal estimado 13%", format_bs(int(history.get("impuestoEstimadoCentavos", 0)))],
        ["Cantidad de ventas", int(history.get("cantidadVentas", 0))],
        ["Utilidad", format_bs(int(history.get("utilidadCentavos", 0)))],
        ["Margen", f"{history.get('margenPorcentaje', 0)}%"],
    ]
    elements.append(_table(summary, [3.2 * inch, 3.15 * inch]))
    elements.append(Spacer(1, 0.22 * inch))

    method_rows: list[list[object]] = [["Metodo", "Ventas", "Total"]]
    method_rows.extend(
        [method, count, format_bs(total)]
        for method, count, total in _method_totals(history)
    )
    elements.append(Paragraph("Total por metodo de pago", styles["AudiEyebrow"]))
    elements.append(_table(method_rows, [2.25 * inch, 1.25 * inch, 2.85 * inch]))
    elements.append(Spacer(1, 0.22 * inch))

    rows: list[list[object]] = [["Venta", "Fecha", "Metodo", "Total", "Impuesto", "Utilidad"]]
    for sale in history.get("ventas", []):
        utility = sum(int(item.get("utilidadCentavos", 0)) for item in sale.get("productos", []))
        tax = round(int(sale.get("totalCentavos", 0)) * 0.13)
        rows.append(
            [
                sale.get("id", ""),
                f"{sale.get('fechaLocal', '')} {sale.get('horaLocal', '')}",
                sale.get("metodo", ""),
                format_bs(int(sale.get("totalCentavos", 0))),
                format_bs(tax),
                format_bs(utility),
            ]
        )
    elements.append(Paragraph("Detalle registroDias", styles["AudiEyebrow"]))
    elements.append(_table(rows, [1.1 * inch, 1.35 * inch, 0.9 * inch, 1 * inch, 1 * inch, 1 * inch]))
    return _build_pdf(elements)
