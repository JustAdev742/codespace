import type { DbOrTx } from '../../db/client.ts';
import { auditLog } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';

export interface AuditEntry {
  actor: AuthContext | { system: string };
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
}

/**
 * Record a sensitive action. Call it inside the same transaction as the
 * change itself, so there is never a change without its audit record.
 */
export async function writeAudit(tx: DbOrTx, environment: string, e: AuditEntry): Promise<void> {
  const isSystem = 'system' in e.actor;
  await tx.insert(auditLog).values({
    actorId: isSystem ? null : (e.actor as AuthContext).user.id,
    actorName: isSystem ? `system:${(e.actor as { system: string }).system}` : (e.actor as AuthContext).user.displayName,
    actorRoles: isSystem ? [] : (e.actor as AuthContext).roles,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    targetName: e.targetName ?? null,
    reason: e.reason ?? null,
    before: e.before === undefined ? null : (e.before as object),
    after: e.after === undefined ? null : (e.after as object),
    ipHash: e.ipHash ?? null,
    environment,
  });
}
