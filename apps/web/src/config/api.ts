const DEVELOPMENT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
const PRODUCTION_API_BASE_URL = 'https://tu-api-en-vercel.app/api/v1';

function normalizeApiBaseUrl(value: string) {
  const clean = value.replace(/\/$/, '');
  return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}

export const API_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? PRODUCTION_API_BASE_URL : DEVELOPMENT_API_BASE_URL),
);
