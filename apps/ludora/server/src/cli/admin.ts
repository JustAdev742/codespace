import { and, eq, inArray } from 'drizzle-orm';
import { ROLE_INFO, isRole, type Role } from '@ludora/shared';
import { loadConfig } from '../config.ts';
import { createDb, type Db } from '../db/client.ts';
import { runMigrations } from '../db/migrate.ts';
import { userRoles, users } from '../db/schema.ts';
import { writeAudit } from '../modules/audit/service.ts';

/*
 * Operator commands. Running them needs shell access to a server with the
 * database credentials, which is the root of trust: this is how the first
 * super administrator is created. Every change is written to the audit log
 * as system:cli.
 *
 *   npm run admin -- list-staff
 *   npm run admin -- grant <username> <role> --reason "why"
 *   npm run admin -- revoke <username> <role> --reason "why"
 */

export interface CliResult {
  ok: boolean;
  message: string;
}

async function findUser(db: Db, username: string) {
  const [u] = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1);
  return u;
}

export async function cliChangeRole(db: Db, environment: string, op: 'grant' | 'revoke', username: string, role: string, reason: string): Promise<CliResult> {
  if (!isRole(role) || role === 'player') return { ok: false, message: `Unknown role "${role}". Roles: ${Object.keys(ROLE_INFO).filter((r) => r !== 'player').join(', ')}.` };
  if (reason.trim().length < 3) return { ok: false, message: 'Give a reason with --reason "..." (at least 3 characters).' };
  const u = await findUser(db, username);
  if (!u) return { ok: false, message: `No account with username "${username}".` };
  if (u.isGuest) return { ok: false, message: 'Guest accounts cannot hold roles.' };
  return db.transaction(async (tx) => {
    const current = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, u.id))).map((r) => r.role);
    if (op === 'grant') {
      if (current.includes(role)) return { ok: false, message: `${u.username} is already ${ROLE_INFO[role].label}.` };
      await tx.insert(userRoles).values({ userId: u.id, role, reason: `CLI: ${reason}` });
    } else {
      if (!current.includes(role)) return { ok: false, message: `${u.username} is not ${ROLE_INFO[role].label}.` };
      if (role === 'superadmin') {
        const supers = await tx.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.role, 'superadmin'));
        if (supers.length <= 1) return { ok: false, message: 'Refusing to remove the last super administrator.' };
      }
      await tx.delete(userRoles).where(and(eq(userRoles.userId, u.id), eq(userRoles.role, role)));
    }
    const after = op === 'grant' ? [...current, role] : current.filter((r) => r !== role);
    await writeAudit(tx, environment, {
      actor: { system: 'cli' },
      action: op === 'grant' ? 'user.role_grant' : 'user.role_revoke',
      targetType: 'user',
      targetId: u.id,
      targetName: u.username ?? u.displayName,
      reason,
      before: { roles: [...current].sort() },
      after: { roles: after.sort(), changed: role },
    });
    return { ok: true, message: `${op === 'grant' ? 'Granted' : 'Removed'} ${ROLE_INFO[role as Role].label} ${op === 'grant' ? 'to' : 'from'} ${u.username}.` };
  });
}

export async function cliListStaff(db: Db): Promise<string[]> {
  const rows = await db
    .select({ username: users.username, displayName: users.displayName, role: userRoles.role, grantedAt: userRoles.grantedAt })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(inArray(userRoles.role, Object.keys(ROLE_INFO).filter((r) => r !== 'player')))
    .orderBy(users.username);
  return rows.map((r) => `${(r.username ?? '-').padEnd(22)} ${r.role.padEnd(12)} since ${r.grantedAt.toISOString().slice(0, 10)}  (${r.displayName})`);
}

function usage(): never {
  console.log('Usage:\n  npm run admin -- list-staff\n  npm run admin -- grant <username> <role> --reason "why"\n  npm run admin -- revoke <username> <role> --reason "why"');
  process.exit(1);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli/admin.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const reasonAt = args.indexOf('--reason');
  const reason = reasonAt >= 0 ? (args[reasonAt + 1] ?? '') : '';
  const positional = reasonAt >= 0 ? args.filter((_, i) => i !== reasonAt && i !== reasonAt + 1) : args;
  const [command, username, role] = positional;
  if (!command) usage();
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL, 1);
  await runMigrations(db);
  try {
    if (command === 'list-staff') {
      const lines = await cliListStaff(db);
      console.log(lines.length ? lines.join('\n') : 'No staff yet. Create the first super administrator with: npm run admin -- grant <username> superadmin --reason "first admin"');
    } else if ((command === 'grant' || command === 'revoke') && username && role) {
      const res = await cliChangeRole(db, config.APP_ENV, command, username, role, reason);
      console.log(res.message);
      process.exitCode = res.ok ? 0 : 1;
    } else usage();
  } finally {
    await pool.end();
  }
}
