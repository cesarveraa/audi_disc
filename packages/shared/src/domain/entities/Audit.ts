export type AuditAction = 'UPDATE' | 'DELETE' | 'PRICE_CHANGE' | 'STOCK_ADJUST';

export interface AuditLog {
  id: string;
  userId: string;
  userEmail?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  previous_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  timestamp: string | null;
}

export interface AuditLogsPage {
  items: AuditLog[];
  total_count: number;
  has_more: boolean;
}
