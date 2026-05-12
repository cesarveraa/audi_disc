function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl?.trim()) {
  throw new Error('Falta configurar VITE_API_BASE_URL en las variables de entorno del frontend.');
}

export const API_URL = normalizeApiBaseUrl(apiBaseUrl);
