import { getAuth } from 'firebase/auth';

import { dispatchAuthInvalid } from '@app/authEvents';
import { API_URL } from '../config/api';
import { getFirebaseApp } from '@infra/firebase/firebaseApp';

export const API_BASE_URL = API_URL;
const configuredTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 45000;

type ApiFetchOptions = Omit<RequestInit, 'body' | 'headers'> & {
  idToken?: string | null;
  json?: unknown;
  headers?: HeadersInit;
  silentStatuses?: number[];
};

const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'secret', 'apiKey', 'api_key', 'privateKey', 'private_key'];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function resolveToken(explicitToken: string | null | undefined, forceRefresh = false) {
  const app = getFirebaseApp();
  const currentUser = app ? getAuth(app).currentUser : null;
  if (currentUser) {
    return currentUser.getIdToken(forceRefresh);
  }
  return explicitToken ?? null;
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()));
}

function redactSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitivePayload);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'input')
      .map(([key, child]) => [
        key,
        isSensitiveKey(key) ? '[redacted]' : redactSensitivePayload(child),
      ]),
  );
}

function formatValidationDetail(detail: unknown) {
  if (!Array.isArray(detail)) {
    return null;
  }

  const messages = detail
    .filter(isRecord)
    .slice(0, 3)
    .map(error => {
      const rawLocation = Array.isArray(error.loc) ? error.loc.map(String) : [];
      const field = rawLocation.filter(part => !['body', 'query', 'path'].includes(part)).join('.') || 'campo';
      const message = typeof error.msg === 'string' ? error.msg : 'valor invalido';
      return `${field}: ${message}`;
    });

  return messages.length ? `Datos invalidos (${messages.join('; ')})` : 'Datos invalidos';
}

function safeStringify(value: unknown) {
  return JSON.stringify(redactSensitivePayload(value));
}

function safeUrlForLog(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

async function readServerMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload?.detail) {
      if (typeof payload.detail === 'string') {
        return payload.detail;
      }
      return formatValidationDetail(payload.detail) ?? safeStringify(payload.detail);
    }
    if (payload?.message) {
      return typeof payload.message === 'string' ? payload.message : safeStringify(payload.message);
    }
  }

  const text = await response.text().catch(() => '');
  return text || `HTTP ${response.status}`;
}

async function sendApiRequest(
  url: string,
  options: ApiFetchOptions,
  token: string,
  controller: AbortController,
) {
  const { json, headers, ...requestOptions } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  if (json !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...requestOptions,
    cache: requestOptions.cache ?? 'no-store',
    headers: requestHeaders,
    signal: requestOptions.signal ?? controller.signal,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const { idToken, silentStatuses, ...requestOptions } = options;
  let token = await resolveToken(idToken);
  if (!token) {
    throw new Error('Sesion Firebase requerida');
  }

  const url = apiUrl(path);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await sendApiRequest(url, requestOptions, token, controller);
    if (response.status === 401) {
      const refreshedToken = await resolveToken(idToken, true).catch(() => null);
      if (refreshedToken) {
        token = refreshedToken;
        response = await sendApiRequest(url, requestOptions, token, controller);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('[AudiDisc Network]', requestOptions.method ?? 'GET', safeUrlForLog(url), error.message);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('El servidor esta tardando demasiado en responder. Intenta actualizar en unos segundos.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const serverMessage = await readServerMessage(response.clone());
    if (!silentStatuses?.includes(response.status)) {
      console.error('[AudiDisc API]', requestOptions.method ?? 'GET', safeUrlForLog(url), response.status, serverMessage);
    }
    if (response.status === 401) {
      dispatchAuthInvalid(serverMessage);
    }
    throw new ApiError(serverMessage, response.status);
  }

  return response;
}

export async function apiJson<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string, options: ApiFetchOptions = {}): Promise<Blob> {
  const response = await apiFetch(path, options);
  return response.blob();
}
