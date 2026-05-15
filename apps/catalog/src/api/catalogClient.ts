import type { CatalogProduct, CatalogProductsPage } from '@audidisc/shared';

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 12000);
const CACHE_TTL_MS = Number(import.meta.env.VITE_CATALOG_CACHE_TTL_MS ?? 60_000);
const STALE_TTL_MS = Number(import.meta.env.VITE_CATALOG_STALE_TTL_MS ?? 10 * 60_000);
const CACHE_PREFIX = 'audidisc.catalog.products.';

export const API_BASE_URL = configuredApiBaseUrl?.trim()
  ? normalizeApiBaseUrl(configuredApiBaseUrl)
  : null;

type CachedPage = {
  data: CatalogProductsPage;
  etag: string | null;
  cachedAt: number;
};

const memoryCache = new Map<string, CachedPage>();
const pendingRequests = new Map<string, Promise<CatalogProductsPage>>();

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

function cacheKey(url: string) {
  return `${CACHE_PREFIX}${url}`;
}

function readCachedPage(url: string): CachedPage | null {
  const memory = memoryCache.get(url);
  if (memory) {
    return memory;
  }
  try {
    const raw = window.localStorage.getItem(cacheKey(url));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedPage;
    if (!Array.isArray(parsed.data?.items) || typeof parsed.cachedAt !== 'number') {
      return null;
    }
    memoryCache.set(url, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedPage(url: string, page: CatalogProductsPage, etag: string | null) {
  const cached: CachedPage = { data: page, etag, cachedAt: Date.now() };
  memoryCache.set(url, cached);
  try {
    window.localStorage.setItem(cacheKey(url), JSON.stringify(cached));
  } catch {
    // Storage can be full or blocked; in-memory cache still helps this session.
  }
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

  const url = buildProductsUrl(params);
  const cached = readCachedPage(url);
  const age = cached ? Date.now() - cached.cachedAt : Number.POSITIVE_INFINITY;
  if (cached && age < CACHE_TTL_MS) {
    return cached.data;
  }

  const pending = pendingRequests.get(url);
  if (pending) {
    return pending;
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = (async () => {
    let response: Response;
    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (cached?.etag) {
        headers.set('If-None-Match', cached.etag);
      }
      response = await fetch(url, {
        cache: 'default',
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (cached && age < STALE_TTL_MS) {
        return cached.data;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('El catalogo esta tardando demasiado en responder. Intenta nuevamente en unos segundos.');
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    if (response.status === 304 && cached) {
      writeCachedPage(url, cached.data, cached.etag);
      return cached.data;
    }

    if (!response.ok) {
      if (cached && age < STALE_TTL_MS) {
        return cached.data;
      }
      throw new Error(await readServerMessage(response.clone()));
    }

    const payload = await response.json();
    const page = normalizeProductsPage(payload);
    writeCachedPage(url, page, response.headers.get('etag'));
    return page;
  })();

  pendingRequests.set(url, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(url);
  }
}
