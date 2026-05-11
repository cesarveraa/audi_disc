export function cents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Money value must be finite');
  }
  return Math.round(value * 100);
}

export function formatBsFromCentavos(value: number): string {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  }).format(value / 100);
}

export function calculateChangeCentavos(recibidoCentavos: number, totalCentavos: number): number {
  return recibidoCentavos - totalCentavos;
}

