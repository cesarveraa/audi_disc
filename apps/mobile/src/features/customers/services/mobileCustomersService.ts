import type { Customer, CustomerCreateInput, CustomerSalesHistory } from '@audidisc/shared';

import { mobileApiJson } from '../../../api/client';

export async function fetchMobileCustomers(idToken: string | null, query = ''): Promise<Customer[]> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  return mobileApiJson<Customer[]>(`/customers?${params.toString()}`, { idToken });
}

export async function createMobileCustomer(params: {
  idToken: string | null;
  payload: CustomerCreateInput;
}): Promise<Customer> {
  return mobileApiJson<Customer>('/customers', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}

export async function fetchMobileCustomerSales(params: {
  idToken: string | null;
  customerId: string;
}): Promise<CustomerSalesHistory> {
  return mobileApiJson<CustomerSalesHistory>(`/customers/${encodeURIComponent(params.customerId)}/sales`, {
    idToken: params.idToken,
  });
}
