import type { Sale } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

function centsToBs(value: number): string {
  return formatBsFromCentavos(value).replace('BOB', 'Bs').trim();
}

async function imageToDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateSaleReceiptPdf(sale: Sale) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: [80, 180] });
  const logo = await imageToDataUrl('/audidisc.jpg');
  const margin = 7;
  let y = 8;

  if (logo) {
    doc.addImage(logo, 'JPEG', 30, y, 20, 20);
    y += 24;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AUDI DISC', 40, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Recibo de venta', 40, y, { align: 'center' });
  y += 5;
  doc.text(`${sale.fechaLocal} ${sale.horaLocal}`, 40, y, { align: 'center' });
  y += 8;

  doc.setDrawColor(229, 231, 235);
  doc.line(margin, y, 80 - margin, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text(`Venta: ${sale.id}`, margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Metodo: ${sale.metodo}`, margin, y);
  y += 7;

  sale.productos.forEach(item => {
    const name = item.nombre.length > 28 ? `${item.nombre.slice(0, 25)}...` : item.nombre;
    doc.setFont('helvetica', 'bold');
    doc.text(name, margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(`${item.cantidad} x ${centsToBs(item.precioVendidoCentavos)}`, margin, y);
    doc.text(centsToBs(item.subtotalCentavos), 80 - margin, y, { align: 'right' });
    y += 6;
  });

  y += 1;
  doc.line(margin, y, 80 - margin, y);
  y += 6;

  const impuesto = Math.round(sale.totalCentavos * 0.13);
  const subtotal = Math.max(0, sale.totalCentavos - impuesto);
  const totals = [
    ['Subtotal', subtotal],
    ['IVA estimado', impuesto],
    ['Total', sale.totalCentavos],
    ['Recibido', sale.recibidoCentavos],
    ['Cambio', sale.cambioCentavos],
  ] as const;

  totals.forEach(([label, value]) => {
    doc.setFont('helvetica', label === 'Total' ? 'bold' : 'normal');
    doc.setFontSize(label === 'Total' ? 10 : 8);
    doc.text(label, margin, y);
    doc.text(centsToBs(value), 80 - margin, y, { align: 'right' });
    y += label === 'Total' ? 6 : 5;
  });

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Gracias por su compra.', 40, y, { align: 'center' });
  y += 4;
  doc.text('Audi Disc', 40, y, { align: 'center' });

  doc.save(`audi-disc-recibo-${sale.id}.pdf`);
}
