import type { ReportsDashboard } from '@audidisc/shared';

import { mobileApiJson } from '../../../api/client';

export async function fetchMobileReportsDashboard(idToken: string | null): Promise<ReportsDashboard> {
  return mobileApiJson<ReportsDashboard>('/reports/dashboard', { idToken });
}
