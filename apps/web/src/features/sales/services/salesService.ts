import type { Sale, SaleCreateInput } from '@audidisc/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

function authHeaders(idToken: string | null): HeadersInit {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

async function downloadPdf(response: Response, filename: string) {
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo generar PDF');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function registerSale(params: {
  idToken: string | null;
  payload: SaleCreateInput;
}): Promise<Sale> {
  const response = await fetch(`${API_BASE_URL}/sales`, {
    method: 'POST',
    headers: authHeaders(params.idToken),
    body: JSON.stringify(params.payload),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo registrar la venta');
  }

  return response.json() as Promise<Sale>;
}

export async function downloadSaleReceipt(params: {
  idToken: string | null;
  saleId: string;
}) {
  if (!params.idToken) {
    throw new Error('Sesion Firebase requerida');
  }
  const response = await fetch(`${API_BASE_URL}/sales/${encodeURIComponent(params.saleId)}/receipt.pdf`, {
    headers: { Authorization: `Bearer ${params.idToken}` },
  });
  await downloadPdf(response, `audi-disc-recibo-${params.saleId}.pdf`);
}
