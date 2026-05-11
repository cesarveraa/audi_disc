import type { Customer, CustomerCreateInput, CustomerSalesHistory, CustomerUpdateInput } from '@audidisc/shared';

import { apiJson } from '../../../api/client';

export async function fetchCustomers(params: {
  idToken: string | null;
  query?: string;
}): Promise<Customer[]> {
  const query = new URLSearchParams();
  if (params.query?.trim()) {
    query.set('q', params.query.trim());
  }
  return apiJson<Customer[]>(`/customers?${query.toString()}`, { idToken: params.idToken });
}

export async function createCustomer(params: {
  idToken: string | null;
  payload: CustomerCreateInput;
}): Promise<Customer> {
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
