import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardSummary, Product } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import {
  fetchDashboardSummary,
  fetchInventoryProducts,
  filterInventory,
} from '@features/inventory/services/inventoryService';

export function useInventory() {
  const { idToken, user } = useRequiredAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [query, setQuery] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProducts, nextDashboard] = await Promise.all([
        fetchInventoryProducts({ idToken, role: user.role }),
        fetchDashboardSummary({ idToken, role: user.role }),
      ]);
      setProducts(nextProducts);
      setDashboard(nextDashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [idToken, user.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredProducts = useMemo(
    () => filterInventory(products, query),
    [products, query],
  );

  return {
    dashboard,
    products,
    filteredProducts,
    query,
    setQuery,
    isLoading,
    error,
    refresh,
  };
}
