import type { AuditLogsPage } from '@audidisc/shared';

import { apiJson } from '../../../api/client';

export async function fetchAuditLogs(params: {
  idToken: string | null;
  page: number;
  limit: number;
}): Promise<AuditLogsPage> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  return apiJson<AuditLogsPage>(`/audit-logs?${query.toString()}`, { idToken: params.idToken });
}
