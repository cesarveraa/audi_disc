import type { AnalyticsDashboard } from '@audidisc/shared';

import { apiJson } from '../../../api/client';

export async function fetchAnalyticsDashboard(params: {
  idToken: string | null;
}): Promise<AnalyticsDashboard> {
  return apiJson<AnalyticsDashboard>('/analytics/dashboard', { idToken: params.idToken });
}
