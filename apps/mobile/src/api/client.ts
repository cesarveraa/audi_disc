import { NativeModules, Platform } from 'react-native';

const API_PORT = 8000;

type MobileApiOptions = Omit<RequestInit, 'body' | 'headers'> & {
  idToken?: string | null;
  json?: unknown;
  headers?: HeadersInit;
};

type SourceCodeModule = {
  scriptURL?: string;
};

function normalizeApiBaseUrl(value: string) {
  const clean = value.replace(/\/$/, '');
  return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}

function getMetroHostApiUrl() {
  const sourceCode = NativeModules.SourceCode as SourceCodeModule | undefined;
  const scriptURL = sourceCode?.scriptURL;
  if (!scriptURL) {
    return null;
  }

  try {
    const parsed = new URL(scriptURL);
    if (!parsed.hostname) {
      return null;
    }
    return `http://${parsed.hostname}:${API_PORT}/api/v1`;
  } catch {
    return null;
  }
}

function unique(values: Array<string | null | undefined>) {
  return values.filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

export function getMobileApiBaseUrls() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL
    ? normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL)
    : null;
  const metroHostUrl = getMetroHostApiUrl();
  const emulatorUrl = Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}/api/v1` : null;
  const simulatorUrl = Platform.OS === 'ios' ? `http://127.0.0.1:${API_PORT}/api/v1` : null;

  return unique([
    configuredUrl,
    metroHostUrl,
    emulatorUrl,
    simulatorUrl,
  ]);
}

export const MOBILE_API_BASE_URL = getMobileApiBaseUrls()[0] ?? normalizeApiBaseUrl(`http://10.0.2.2:${API_PORT}`);

async function readServerMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  if (payload?.detail) {
    return typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail);
  }
  return `HTTP ${response.status}`;
}

export async function mobileApiFetch(path: string, options: MobileApiOptions = {}) {
  const { idToken, json, headers, ...requestOptions } = options;
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }

  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${idToken}`);
  if (json !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const suffix = path.startsWith('/') ? path : `/${path}`;
  const baseUrls = getMobileApiBaseUrls();
  let lastNetworkError: Error | null = null;

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}${suffix}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...requestOptions,
        headers: requestHeaders,
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    } catch (error) {
      lastNetworkError = error instanceof Error ? error : new Error('Network request failed');
      console.warn('[AudiDisc Mobile Network]', requestOptions.method ?? 'GET', url, lastNetworkError.message);
      continue;
    }

    if (!response.ok) {
      const serverMessage = await readServerMessage(response.clone());
      console.warn('[AudiDisc Mobile API]', requestOptions.method ?? 'GET', url, response.status, serverMessage);
      throw new Error(serverMessage);
    }

    return response;
  }

  const tried = baseUrls.join(', ');
  throw new Error(
    lastNetworkError
      ? `${lastNetworkError.message}. No se pudo conectar al API. URLs probadas: ${tried}`
      : `No se pudo conectar al API. URLs probadas: ${tried}`,
  );
}

export async function mobileApiJson<T>(path: string, options: MobileApiOptions = {}): Promise<T> {
  const response = await mobileApiFetch(path, options);
  return response.json() as Promise<T>;
}
