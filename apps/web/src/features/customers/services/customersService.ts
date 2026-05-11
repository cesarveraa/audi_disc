import type { Customer, CustomerCreateInput, CustomerSalesHistory, CustomerUpdateInput } from '@audidisc/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

function authHeaders(idToken: string | null, json = false): HeadersInit {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${idToken}`,
  };
}

export async function fetchCustomers(params: {
  idToken: string | null;
  query?: string;
}): Promise<Customer[]> {
  const query = new URLSearchParams();
  if (params.query?.trim()) {
    query.set('q', params.query.trim());
  }
  const response = await fetch(`${API_BASE_URL}/customers?${query.toString()}`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar clientes');
  }
  return response.json() as Promise<Customer[]>;
}

export async function createCustomer(params: {
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

export async function updateCustomer(params: {
  idToken: string | null;
  customerId: string;
  payload: CustomerUpdateInput;
}): Promise<Customer> {
  const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(params.customerId)}`, {
    method: 'PATCH',
    headers: authHeaders(params.idToken, true),
    body: JSON.stringify(params.payload),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo actualizar cliente');
  }
  return response.json() as Promise<Customer>;
}

export async function fetchCustomerSales(params: {
  idToken: string | null;
  customerId: string;
}): Promise<CustomerSalesHistory> {
  const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(params.customerId)}/sales`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar historial del cliente');
  }
  return response.json() as Promise<CustomerSalesHistory>;
}
