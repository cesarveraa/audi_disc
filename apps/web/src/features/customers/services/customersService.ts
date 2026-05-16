import type { Customer, CustomerCreateInput, CustomerSalesHistory, CustomerUpdateInput } from '@audidisc/shared';

import { apiJson } from '../../../api/client';

const CUSTOMER_CACHE_TTL_MS = 60_000;
const customersCache = new Map<string, { expiresAt: number; value: Customer[] }>();
const customersRequests = new Map<string, Promise<Customer[]>>();

function cacheKey(query?: string) {
  return (query ?? '').trim().toLocaleLowerCase('es-BO');
}

function clearCustomersCache() {
  customersCache.clear();
  customersRequests.clear();
}

export async function fetchCustomers(params: {
  idToken: string | null;
  query?: string;
}): Promise<Customer[]> {
  const query = new URLSearchParams();
  if (params.query?.trim()) {
    query.set('q', params.query.trim());
  }
  const key = cacheKey(params.query);
  const cached = customersCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const currentRequest = customersRequests.get(key);
  if (currentRequest) {
    return currentRequest;
  }
  try {
    const request = apiJson<Customer[]>(`/customers?${query.toString()}`, { idToken: params.idToken })
      .then(customers => {
        customersCache.set(key, { expiresAt: Date.now() + CUSTOMER_CACHE_TTL_MS, value: customers });
        return customers;
      })
      .finally(() => {
        customersRequests.delete(key);
      });
    customersRequests.set(key, request);
    return await request;
  } catch (error) {
    if (cached) {
      return cached.value;
    }
    throw error;
  }
}

export async function createCustomer(params: {
  idToken: string | null;
  payload: CustomerCreateInput;
}): Promise<Customer> {
  clearCustomersCache();
  return apiJson<Customer>('/customers', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}

export async function updateCustomer(params: {
  idToken: string | null;
  customerId: string;
  payload: CustomerUpdateInput;
}): Promise<Customer> {
  clearCustomersCache();
  return apiJson<Customer>(`/customers/${encodeURIComponent(params.customerId)}`, {
    idToken: params.idToken,
    method: 'PATCH',
    json: params.payload,
  });
}

export async function fetchCustomerSales(params: {
  idToken: string | null;
  customerId: string;
}): Promise<CustomerSalesHistory> {
  return apiJson<CustomerSalesHistory>(`/customers/${encodeURIComponent(params.customerId)}/sales`, {
    idToken: params.idToken,
  });
}
