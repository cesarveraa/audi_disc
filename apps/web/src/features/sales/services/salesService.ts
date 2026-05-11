import type { Sale, SaleCreateInput } from '@audidisc/shared';

import { apiBlob, apiJson } from '../../../api/client';

async function downloadPdf(blob: Blob, filename: string) {
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
  return apiJson<Sale>('/sales/checkout', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}

export async function downloadSaleReceipt(params: {
  idToken: string | null;
  saleId: string;
}) {
  const blob = await apiBlob(`/sales/${encodeURIComponent(params.saleId)}/receipt.pdf`, {
    idToken: params.idToken,
  });
  await downloadPdf(blob, `audi-disc-recibo-${params.saleId}.pdf`);
}
