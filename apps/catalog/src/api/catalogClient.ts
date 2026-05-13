import type { CatalogProduct, CatalogProductsPage } from '@audidisc/shared';

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

export type CatalogProductsRequest = {
  page?: number;
  limit?: number;
  q?: string;
  marca?: string;
  categoria?: string;
};

function buildProductsUrl(params: CatalogProductsRequest) {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 10));
  if (params.q?.trim()) {
    search.set('q', params.q.trim());
  }
  if (params.marca?.trim()) {
    search.set('marca', params.marca.trim());
  }
  if (params.categoria?.trim()) {
    search.set('categoria', params.categoria.trim());
  }
  return `${API_BASE_URL}/public/products?${search.toString()}`;
}

function normalizeProductsPage(payload: unknown): CatalogProductsPage {
  if (Array.isArray(payload)) {
    return {
      items: payload as CatalogProduct[],
      total_count: payload.length,
      has_more: false,
    };
  }

  const page = payload as Partial<CatalogProductsPage> | null;
  return {
    items: Array.isArray(page?.items) ? page.items : [],
    total_count: Number(page?.total_count ?? 0),
    has_more: Boolean(page?.has_more),
  };
}

export async function fetchCatalogProducts(params: CatalogProductsRequest = {}): Promise<CatalogProductsPage> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar VITE_API_BASE_URL para cargar el catalogo.');
  }

  const response = await fetch(buildProductsUrl(params), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await readServerMessage(response.clone()));
  }

  const payload = await response.json();
  return normalizeProductsPage(payload);
}
