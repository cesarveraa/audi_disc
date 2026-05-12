import type { CatalogProduct } from '@audidisc/shared';

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = configuredApiBaseUrl?.trim()
  ? normalizeApiBaseUrl(configuredApiBaseUrl)
  : null;

async function readServerMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload?.detail) {
      return typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail);
    }
  }

  return response.text().catch(() => `HTTP ${response.status}`);
}

export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar VITE_API_BASE_URL para cargar el catalogo.');
  }

  const response = await fetch(`${API_BASE_URL}/public/products`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await readServerMessage(response.clone()));
  }

  return response.json() as Promise<CatalogProduct[]>;
}
