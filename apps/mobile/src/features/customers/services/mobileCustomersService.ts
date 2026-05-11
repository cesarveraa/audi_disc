import type { Customer, CustomerCreateInput, CustomerSalesHistory } from '@audidisc/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

function authHeaders(idToken: string | null, json = false): HeadersInit {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${idToken}`,
  };
}

export async function fetchMobileCustomers(idToken: string | null, query = ''): Promise<Customer[]> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  const response = await fetch(`${API_BASE_URL}/customers?${params.toString()}`, {
    headers: authHeaders(idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar clientes');
  }
  return response.json() as Promise<Customer[]>;
}

export async function createMobileCustomer(params: {
  idToken: string | null;
  payload: CustomerCreateInput;
}): Promise<Customer> {
  const response = await fetch(`${API_BASE_URL}/customers`, {
    method: 'POST',
    headers: authHeaders(params.idToken, true),
    body: JSON.stringify(params.payload),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo crear cliente');
  }
  return response.json() as Promise<Customer>;
}

export async function fetchMobileCustomerSales(params: {
  idToken: string | null;
  customerId: string;
}): Promise<CustomerSalesHistory> {
  const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(params.customerId)}/sales`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar historial de cliente');
  }
  return response.json() as Promise<CustomerSalesHistory>;
}
