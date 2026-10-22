import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FlaskConical, KeyRound, LogOut, Unlock } from 'lucide-react';
import {
  MODERATION_ACTION_INFO,
  REPORT_REASON_INFO,
  ROLE_INFO,
  realGrantCap,
  type ModerationAction,
  type ReportReason,
  type Role,
} from '@ludora/shared';
import { api, newRequestKey } from '../../lib/api.ts';
import { formatNumber, timeAgo } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { Amount, Badge, ErrorNotice, Field, Input, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { AccountBadges, type StaffUser } from './Users.tsx';
import { ActionDialog, Card, DataTable, KeyValues, SecretDialog, StaffPage, Stat, StatusPill, dateTime, useStaffMutation } from './ui.tsx';

interface Detail {
  user: StaffUser & {
    friendCode: string;
    email: string | null;
    emailVerified: boolean;
    mutedUntil: string | null;
    suspendedUntil: string | null;
    lockedUntil: string | null;
    failedLogins: number;
    xp: number;
    confirmWord: string;
  };
  roles: { role: Role; reason: string | null; grantedAt: string; grantedBy: string | null }[];
  /** Moderation, plus account help the player is told about: a teacher making them a recovery code (D38). */
  moderation: { id: number; action: ModerationAction | 'teacher_recovery_code'; reason: string; until: string | null; actor: string; createdAt: string; acknowledgedAt: string | null }[];
  reports: { id: number; reason: ReportReason; details: string; status: string; createdAt: string }[];
  sessions: { active: number; lastSeenAt: string | null };
  stats: { gamesPlayed: number; gamesWon: number; gamesHosted: number; questionsAnswered: number; questionsCorrect: number; packsOpened: number; dailyStreak: number } | null;
  inventory: { type: string; distinct: number; total: number }[];
  games: { gameId: string; modeId: string; variantId: string | null; setTitle: string; endedAt: string; rank: number; score: number; playerCount: number; hosted: boolean }[];
  entitlements: { id: number; kind: string; reason: string; grantedBy: string | null; createdAt: string; expiresAt: string | null; revokedAt: string | null; active: boolean }[];
  economy: { balances: Record<string, number>; ledger: { id: number; currency: string; delta: number; balanceAfter: number; reason: string; unlimited: boolean; createdAt: string }[] } | null;
  can: { moderate: boolean; edit: boolean; assignRoles: Role[]; grant: boolean; testTools: boolean };
}

const ACCOUNT_TYPES: Record<string, string> = { player: 'Player', student: 'Student', teacher: 'Teacher' };
const AGE_BANDS: Record<string, string> = { under13: 'Under 13', '13to17': '13 to 17', adult: 'Adult' };

const DURATIONS: [string, number][] = [
  ['1 hour', 1],
  ['1 day', 24],
  ['3 days', 72],
  ['1 week', 168],
  ['30 days', 720],
];

type Dialog =
  | { kind: 'moderate'; action: ModerationAction }
  | { kind: 'role'; role: Role; grant: boolean }
  | { kind: 'recovery' }
  | { kind: 'signout' }
  | { kind: 'unlock' }
  | { kind: 'money'; direction: 'grant' | 'revoke' }
  | null;

export default function UserDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const reportId = Number(params.get('report')) || undefined;
  const key = ['admin', 'user', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Detail>(`/api/admin/users/${id}`) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const close = () => setDialog(null);

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) {
    return (
      <StaffPage title="Account">
        <ErrorNotice message={q.error instanceof Error ? q.error.message : 'Could not load this account.'} onRetry={() => void q.refetch()} />
      </StaffPage>
    );
  }
  const d = q.data;
  const u = d.user;
  const now = Date.now();
  const muted = Boolean(u.mutedUntil && Date.parse(u.mutedUntil) > now);
  const locked = Boolean(u.lockedUntil && Date.parse(u.lockedUntil) > now) || u.failedLogins > 0;
  const heldRoles = d.roles.map((r) => r.role);
  const addable = d.can.assignRoles.filter((r) => !heldRoles.includes(r));

  return (
    <StaffPage
      title={u.displayName}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span>{u.username ? `@${u.username}` : 'Guest account'}</span>
          <StatusPill status={u.status} />
          {muted ? <Badge tone="amber">Muted until {dateTime(u.mutedUntil)}</Badge> : null}
          <AccountBadges u={u} />
        </span>
      }
      actions={
        <ButtonLink to="/staff/users" variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />}>
          All players
        </ButtonLink>
      }
    >
      {reportId ? (
        <div className="mb-4 rounded-[var(--radius-m)] border border-lantern/50 bg-lantern/10 px-4 py-2.5 text-sm text-text">
          You came here from report #{reportId}. A moderation action you take now marks that report as actioned.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Account">
            <KeyValues
              items={[
                ['Account id', <code className="text-xs">{u.id}</code>],
                ['Friend code', u.friendCode],
                ['Account type', ACCOUNT_TYPES[u.accountType] ?? u.accountType],
                ['Age band', u.ageBand ? (AGE_BANDS[u.ageBand] ?? u.ageBand) : 'Not given'],
                ['Email', u.email ? `${u.email}${u.emailVerified ? ' (verified)' : ''}` : 'None'],
                ['Level', `${u.level} (${formatNumber(u.xp)} XP)`],
                ['Joined', dateTime(u.createdAt)],
                ['Last seen', u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'Never'],
                ['Signed-in sessions', String(d.sessions.active)],
                ['Failed sign-ins', u.failedLogins ? `${u.failedLogins}${u.lockedUntil ? `, locked until ${dateTime(u.lockedUntil)}` : ''}` : 'None'],
                ...(u.status === 'suspended' ? ([['Suspended until', u.suspendedUntil ? dateTime(u.suspendedUntil) : 'No end date']] as [string, ReactNode][]) : []),
              ]}
            />
          </Card>

          {d.stats ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Games played" value={formatNumber(d.stats.gamesPlayed)} hint={`${formatNumber(d.stats.gamesWon)} won`} />
              <Stat label="Games hosted" value={formatNumber(d.stats.gamesHosted)} />
              <Stat label="Accuracy" value={d.stats.questionsAnswered ? `${Math.round((d.stats.questionsCorrect / d.stats.questionsAnswered) * 100)}%` : '-'} hint={`${formatNumber(d.stats.questionsAnswered)} answers`} />
              <Stat label="Lanterns opened" value={formatNumber(d.stats.packsOpened)} />
            </div>
          ) : null}

          {d.economy ? (
            <Card
              title="Wallet and recent transactions"
              actions={
                d.can.grant ? (
                  <>
                    <Button size="sm" onClick={() => setDialog({ kind: 'money', direction: 'grant' })}>
                      Give
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'money', direction: 'revoke' })}>
                      Take away
                    </Button>
                  </>
                ) : null
              }
            >
              <div className="mb-3 flex flex-wrap gap-4">
                {Object.entries(d.economy.balances).map(([c, v]) => (
                  <Amount key={c} currency={c} value={v} />
                ))}
              </div>
              <DataTable
                minWidth={440}
                caption="Recent transactions"
                rows={d.economy.ledger}
                rowKey={(l) => l.id}
                empty="No transactions yet."
                columns={[
                  { key: 'when', header: 'When', cell: (l) => dateTime(l.createdAt) },
                  { key: 'reason', header: 'Reason', cell: (l) => <span>{l.reason.replace(/_/g, ' ')}{l.unlimited ? <Badge tone="amber" className="ml-1">unlimited</Badge> : null}</span> },
                  { key: 'delta', header: 'Change', align: 'right', cell: (l) => <span className={l.delta < 0 ? 'text-ember' : l.delta > 0 ? 'text-glim' : ''}>{l.delta > 0 ? '+' : ''}{formatNumber(l.delta)} {l.currency}</span> },
                  { key: 'after', header: 'Balance after', align: 'right', cell: (l) => formatNumber(l.balanceAfter) },
                ]}
              />
              <Link to={`/staff/economy?tab=ledger&userId=${u.id}`} className="mt-2 inline-block text-sm font-semibold text-link">
                Full ledger for this account
              </Link>
            </Card>
          ) : null}

          <Card title="Moderation history">
            <DataTable
              minWidth={520}
              caption="Moderation history"
              rows={d.moderation}
              rowKey={(m) => m.id}
              empty="No moderation actions."
              columns={[
                { key: 'when', header: 'When', cell: (m) => dateTime(m.createdAt) },
                { key: 'action', header: 'Action', cell: (m) => (m.action === 'teacher_recovery_code' ? 'Teacher made a recovery code' : MODERATION_ACTION_INFO[m.action].past) },
                { key: 'reason', header: 'Reason', cell: (m) => <span className="whitespace-pre-wrap">{m.reason}</span> },
                { key: 'until', header: 'Until', cell: (m) => (m.until ? dateTime(m.until) : '-') },
                { key: 'by', header: 'By', cell: (m) => m.actor },
                { key: 'seen', header: 'Seen by player', cell: (m) => (m.action === 'warn' || m.action === 'mute' || m.action === 'reset_name' || m.action === 'teacher_recovery_code' ? (m.acknowledgedAt ? dateTime(m.acknowledgedAt) : 'Not yet') : '-') },
              ]}
            />
          </Card>

          {d.reports.length ? (
            <Card title="Reports about this account">
              <DataTable
                minWidth={440}
                caption="Reports"
                rows={d.reports}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'when', header: 'When', cell: (r) => dateTime(r.createdAt) },
                  { key: 'reason', header: 'Reason', cell: (r) => REPORT_REASON_INFO[r.reason]?.label ?? r.reason },
                  { key: 'details', header: 'Details', cell: (r) => <span className="whitespace-pre-wrap">{r.details || '-'}</span> },
                  { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
                ]}
              />
            </Card>
          ) : null}

          <Card title="Recent games">
            <DataTable
              minWidth={440}
              caption="Recent games"
              rows={d.games}
              rowKey={(g) => g.gameId}
              empty="No finished games."
              columns={[
                { key: 'when', header: 'Ended', cell: (g) => dateTime(g.endedAt) },
                { key: 'mode', header: 'Mode', cell: (g) => g.variantId ?? g.modeId },
                { key: 'set', header: 'Set', cell: (g) => g.setTitle },
                { key: 'rank', header: 'Place', align: 'right', cell: (g) => `${g.rank} of ${g.playerCount}` },
                { key: 'role', header: 'Role', cell: (g) => (g.hosted ? 'Host' : 'Player') },
              ]}
            />
          </Card>
        </div>

        <aside className="order-first flex min-w-0 flex-col gap-4 xl:order-none">
          <Card title="Moderation">
            {d.can.moderate ? (
              <div className="flex flex-col gap-2">
                <ModButton action="warn" onPick={setDialog} />
                {muted ? <ModButton action="unmute" onPick={setDialog} /> : <ModButton action="mute" onPick={setDialog} />}
                {u.status === 'suspended' ? <ModButton action="unsuspend" onPick={setDialog} /> : u.status === 'active' ? <ModButton action="suspend" onPick={setDialog} /> : null}
                {u.status === 'banned' ? <ModButton action="unban" onPick={setDialog} /> : <ModButton action="ban" danger onPick={setDialog} />}
                <ModButton action="reset_name" onPick={setDialog} />
              </div>
            ) : (
              <p className="text-sm text-text-2">{noActionReason(d, 'moderate')}</p>
            )}
          </Card>

          <Card title="Roles">
            {d.roles.length ? (
              <ul className="mb-3 flex flex-col gap-2">
                {d.roles.map((r) => (
                  <li key={r.role} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold">{ROLE_INFO[r.role]?.label ?? r.role}</div>
                      <div className="text-xs text-text-3">
                        {r.grantedBy ? `By ${r.grantedBy}, ` : ''}
                        {timeAgo(r.grantedAt)}
                        {r.reason ? `: ${r.reason}` : ''}
                      </div>
                    </div>
                    {d.can.assignRoles.includes(r.role) ? (
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'role', role: r.role, grant: false })}>
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-text-2">Player only. No staff or creator roles.</p>
            )}
            {addable.length ? <AddRole roles={addable} onPick={(role) => setDialog({ kind: 'role', role, grant: true })} /> : d.can.assignRoles.length ? null : <p className="text-xs text-text-3">{noActionReason(d, 'roles')}</p>}
          </Card>

          <Card title="Sign-in">
            {d.can.edit ? (
              <div className="flex flex-col gap-2">
                {u.username ? (
                  <Button icon={<KeyRound className="size-4" />} onClick={() => setDialog({ kind: 'recovery' })}>
                    Issue a recovery code
                  </Button>
                ) : null}
                <Button icon={<LogOut className="size-4" />} onClick={() => setDialog({ kind: 'signout' })} disabled={!d.sessions.active}>
                  Sign out everywhere
                </Button>
                {locked ? (
                  <Button icon={<Unlock className="size-4" />} onClick={() => setDialog({ kind: 'unlock' })}>
                    Clear failed sign-ins
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-2">{noActionReason(d, 'edit')}</p>
            )}
          </Card>

          {d.entitlements.length ? (
            <Card title="Test entitlements">
              <ul className="flex flex-col gap-2 text-sm">
                {d.entitlements.map((e) => (
                  <li key={e.id}>
                    <span className="font-semibold">{e.kind.replace(/_/g, ' ')}</span> <StatusPill status={e.active ? 'active' : 'ended'} label={e.active ? 'active' : e.revokedAt ? 'revoked' : 'expired'} />
                    <div className="text-xs text-text-3">
                      {e.grantedBy ? `By ${e.grantedBy}. ` : ''}
                      {e.expiresAt ? `Ends ${dateTime(e.expiresAt)}. ` : ''}
                      {e.reason}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {d.can.testTools ? (
            <ButtonLink to={`/staff/testing?account=${u.id}`} icon={<FlaskConical className="size-4" />}>
              Open in testing tools
            </ButtonLink>
          ) : null}
        </aside>
      </div>

      <UserDialogs detail={d} dialog={dialog} close={close} reportId={reportId} onSecret={setSecret} queryKey={key} />
      <SecretDialog
        open={Boolean(secret)}
        onOpenChange={(o) => !o && setSecret(null)}
        title="Recovery code"
        description="Give this to the account owner through a channel you have verified. It is shown only once and replaces any earlier code. The account has been signed out everywhere."
        values={secret ? [['Recovery code', secret]] : []}
      />
    </StaffPage>
  );
}

function noActionReason(d: Detail, what: 'moderate' | 'edit' | 'roles'): string {
  if (!d.can.moderate && !d.can.edit && d.roles.length) return 'This account has the same or a higher role than yours, or it is your own.';
  if (what === 'moderate') return 'Your role cannot moderate this account.';
  if (what === 'edit') return 'Your role cannot change sign-in for this account.';
  return d.user.isGuest ? 'Guests cannot hold roles.' : 'Your role cannot assign roles here.';
}

function ModButton({ action, danger = false, onPick }: { action: ModerationAction; danger?: boolean; onPick: (d: Dialog) => void }) {
  return (
    <Button variant={danger ? 'danger' : 'secondary'} className="justify-start" onClick={() => onPick({ kind: 'moderate', action })}>
      {MODERATION_ACTION_INFO[action].label}
    </Button>
  );
}

function AddRole({ roles, onPick }: { roles: Role[]; onPick: (r: Role) => void }) {
  const [role, setRole] = useState<Role>(roles[0]!);
  return (
    <div className="flex gap-2">
      <Select aria-label="Role to add" value={role} onChange={(e) => setRole(e.target.value as Role)} className="min-w-0 flex-1">
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_INFO[r].label}
          </option>
        ))}
      </Select>
      <Button onClick={() => onPick(role)}>Add role</Button>
    </div>
  );
}

function UserDialogs({ detail: d, dialog, close, reportId, onSecret, queryKey }: { detail: Detail; dialog: Dialog; close: () => void; reportId: number | undefined; onSecret: (code: string) => void; queryKey: string[] }) {
  const u = d.user;
  const base = `/api/admin/users/${u.id}`;
  const invalidate = [queryKey, ['admin', 'users']];
  const [hours, setHours] = useState<number | ''>(24);
  const moderate = useStaffMutation((body: object) => api.post<{ roomsAffected: number }>(`${base}/moderate`, body), {
    invalidate: [...invalidate, ['admin', 'reports']],
    success: (res, vars) => {
      const action = (vars as { action: ModerationAction }).action;
      return `${MODERATION_ACTION_INFO[action].past}.${res.roomsAffected ? ` Removed from ${res.roomsAffected} live ${res.roomsAffected === 1 ? 'room' : 'rooms'}.` : ''}`;
    },
    silentError: true,
  });
  const role = useStaffMutation((body: object) => api.post(`${base}/roles`, body), { invalidate, success: 'Roles updated', silentError: true });
  const simple = useStaffMutation((args: { path: string; body: object }) => api.post<{ recoveryCode?: string }>(`${base}/${args.path}`, args.body), { invalidate, silentError: true });

  if (!dialog) return null;
  const open = true;
  const onOpenChange = (v: boolean) => !v && close();

  if (dialog.kind === 'moderate') {
    const info = MODERATION_ACTION_INFO[dialog.action];
    const needsHours = dialog.action === 'mute' || dialog.action === 'suspend';
    const indefinite = dialog.action === 'suspend' && hours === '';
    const confirmWord = dialog.action === 'ban' || indefinite ? u.confirmWord : null;
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`${info.label}: ${u.displayName}`}
        description={info.description}
        confirmWord={confirmWord}
        confirmLabel={info.label}
        variant={dialog.action === 'ban' || dialog.action === 'suspend' ? 'danger' : 'primary'}
        reasonLabel={dialog.action === 'warn' ? 'Message to the player' : 'Reason'}
        reasonHint={dialog.action === 'warn' || dialog.action === 'mute' ? 'The player sees this, and it is saved in the audit log.' : undefined}
        onSubmit={({ reason, confirm }) =>
          moderate.mutateAsync({ action: dialog.action, reason, ...(confirm ? { confirm } : {}), ...(needsHours && hours !== '' ? { durationHours: hours } : {}), ...(reportId ? { reportId } : {}) })
        }
      >
        {needsHours ? (
          <Field label="How long">
            {(p) => (
              <Select {...p} value={String(hours)} onChange={(e) => setHours(e.target.value === '' ? '' : Number(e.target.value))}>
                {DURATIONS.map(([label, h]) => (
                  <option key={h} value={h}>
                    {label}
                  </option>
                ))}
                {dialog.action === 'suspend' ? <option value="">No end date</option> : null}
              </Select>
            )}
          </Field>
        ) : null}
      </ActionDialog>
    );
  }

  if (dialog.kind === 'role') {
    const label = ROLE_INFO[dialog.role].label;
    const big = dialog.role === 'admin' || dialog.role === 'superadmin';
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title={dialog.grant ? `Make ${u.displayName} ${label}` : `Remove ${label} from ${u.displayName}`}
        description={dialog.grant ? ROLE_INFO[dialog.role].description : 'They lose this role on their next request.'}
        confirmWord={big ? u.confirmWord : null}
        confirmLabel={dialog.grant ? 'Add role' : 'Remove role'}
        variant={dialog.grant ? 'primary' : 'danger'}
        onSubmit={({ reason, confirm }) => role.mutateAsync({ role: dialog.role, grant: dialog.grant, reason, ...(confirm ? { confirm } : {}) })}
      />
    );
  }

  if (dialog.kind === 'recovery') {
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Issue a recovery code"
        description="Use this when the owner has lost their password and you have checked it is really them. The account is signed out everywhere, and the new code replaces the old one."
        confirmWord={u.username}
        confirmLabel="Issue code"
        onSubmit={async ({ reason, confirm }) => {
          const res = await simple.mutateAsync({ path: 'recovery-code', body: { reason, confirm } });
          if (res.recoveryCode) onSecret(res.recoveryCode);
        }}
      />
    );
  }

  if (dialog.kind === 'signout' || dialog.kind === 'unlock') {
    const signout = dialog.kind === 'signout';
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title={signout ? 'Sign out everywhere' : 'Clear failed sign-ins'}
        description={signout ? 'Ends every session on every device. They can sign in again straight away.' : 'Removes the temporary lock after too many wrong passwords.'}
        confirmLabel={signout ? 'Sign out' : 'Clear'}
        onSubmit={({ reason }) => simple.mutateAsync({ path: signout ? 'sign-out' : 'unlock', body: { reason } })}
      />
    );
  }

  return <MoneyDialog detail={d} direction={dialog.direction} onClose={close} invalidate={invalidate} />;
}

function MoneyDialog({ detail: d, direction, onClose, invalidate }: { detail: Detail; direction: 'grant' | 'revoke'; onClose: () => void; invalidate: string[][] }) {
  const u = d.user;
  const canCatalog = useCan('catalog.manage');
  const [what, setWhat] = useState<'currency' | 'item'>('currency');
  const [currency, setCurrency] = useState('sparks');
  const [amount, setAmount] = useState('');
  const [itemId, setItemId] = useState('');
  const [requestKey] = useState(() => newRequestKey(direction));
  const items = useQuery({
    queryKey: ['admin', 'items', 'picker'],
    queryFn: () => api.get<{ items: { id: string; name: string; type: string }[] }>('/api/admin/items'),
    enabled: what === 'item' && canCatalog,
  });
  const move = useStaffMutation((body: object) => api.post<{ itemName?: string; amount?: number; currency?: string }>(`/api/admin/economy/${direction}`, body), {
    invalidate,
    success: (res) => `${direction === 'grant' ? 'Gave' : 'Took'} ${res.itemName ?? `${formatNumber(res.amount ?? 0)} ${res.currency ?? ''}`.trim()}`,
    silentError: true,
  });
  const currencies = Object.keys(d.economy?.balances ?? { sparks: 0, moonstones: 0, dust: 0 });
  const n = Number(amount);
  const cap = realGrantCap(currency);
  const valid = what === 'currency' ? Number.isInteger(n) && n > 0 && (u.isTestAccount || n <= cap) : itemId.trim().length > 0;
  return (
    <ActionDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`${direction === 'grant' ? 'Give to' : 'Take from'} ${u.displayName}`}
      description={u.isTestAccount ? 'Test account: no typed confirmation needed.' : 'This is a real player. Changes are capped, written to their transaction history and need the account name typed out.'}
      confirmWord={u.isTestAccount ? null : u.confirmWord}
      confirmLabel={direction === 'grant' ? 'Give' : 'Take away'}
      variant={direction === 'grant' ? 'primary' : 'danger'}
      disabled={!valid}
      onSubmit={({ reason, confirm }) =>
        move.mutateAsync({
          userId: u.id,
          reason,
          requestKey,
          ...(confirm ? { confirm } : {}),
          ...(what === 'currency' ? { currency, amount: n } : { itemId: itemId.trim(), quantity: 1 }),
        })
      }
    >
      <div className="flex gap-2" role="radiogroup" aria-label="What to change">
        {(['currency', 'item'] as const).map((w) => (
          <Button key={w} size="sm" variant={what === w ? 'primary' : 'secondary'} role="radio" aria-checked={what === w} onClick={() => setWhat(w)}>
            {w === 'currency' ? 'Currency' : 'Item'}
          </Button>
        ))}
      </div>
      {what === 'currency' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            {(p) => (
              <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Amount" hint={u.isTestAccount ? undefined : `Up to ${formatNumber(cap)} at a time.`}>
            {(p) => <Input {...p} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />}
          </Field>
        </div>
      ) : (
        <Field label="Item id" hint={canCatalog ? 'Start typing to pick from the catalogue.' : 'The item id, for example glim-sprig.'}>
          {(p) => (
            <>
              <Input {...p} list="staff-item-ids" value={itemId} onChange={(e) => setItemId(e.target.value)} autoComplete="off" />
              <datalist id="staff-item-ids">
                {(items.data?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.type})
                  </option>
                ))}
              </datalist>
            </>
          )}
        </Field>
      )}
    </ActionDialog>
  );
}
