import type { AdminCapability, AdminOperation } from '@/types';

export type AdminOperationOutcome =
  | 'authorized'
  | 'rejected'
  | 'completed'
  | 'failed';

export interface AdminOperationAuditEvent {
  requestId: string;
  capability: AdminCapability;
  operation: AdminOperation;
  outcome: AdminOperationOutcome;
  dryRun?: boolean;
}

export function logAdminOperation(event: AdminOperationAuditEvent): void {
  console.log({
    event: 'admin_operation',
    requestId: event.requestId,
    capability: event.capability,
    operation: event.operation,
    outcome: event.outcome,
    ...(event.dryRun === undefined ? {} : { dryRun: event.dryRun })
  });
}
