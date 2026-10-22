import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ROLE_INFO, ROLES, type Role } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, Field, Input, Skeleton, Switch, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, Card, StaffPage, StatusPill, dateTime, useStaffMutation } from './ui.tsx';

/*
 * Feature flags. A flag is on for a person when it is on for everyone, or
 * they hold one of its roles, or their account is listed, or they fall in
 * the rollout percentage (stable per account). Edits are drafts until saved
 * with a reason.
 */

interface FlagRow {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  roles: string[];
  userIds: string[];
  updatedAt: string;
  updatedBy: string | null;
}

type FlagPatch = { enabled?: boolean; rolloutPercent?: number; roles?: Role[]; userIds?: string[] };

/** What the server accepts as an account id (zod's uuid). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_USERS = 200;

const listFormat = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

function roleLabel(r: string): string {
  return ROLE_INFO[r as Role]?.label ?? r;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function audience(f: { enabled: boolean; rolloutPercent: number; roles: readonly string[]; userIds: readonly string[] }): string {
  if (f.enabled) return 'On for everyone.';
  const parts: string[] = [];
  if (f.roles.length) parts.push(`the ${listFormat.format(f.roles.map(roleLabel))} ${f.roles.length === 1 ? 'role' : 'roles'}`);
  if (f.userIds.length) parts.push(plural(f.userIds.length, 'listed account'));
  if (f.rolloutPercent > 0) parts.push(`${f.rolloutPercent}% of other signed-in players`);
  return parts.length ? `On only for ${listFormat.format(parts)}.` : 'Off for everyone.';
}

function FlagState({ f }: { f: FlagRow }) {
  if (f.enabled) return <StatusPill status="active" label="On for everyone" />;
  if (f.roles.length || f.userIds.length || f.rolloutPercent > 0) return <StatusPill status="paused" label="Partly on" />;
  return <StatusPill status="ended" label="Off" />;
}

export default function Flags() {
  const flags = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api.get<{ flags: FlagRow[] }>('/api/admin/flags') });
  return (
    <StaffPage title="Feature flags" description="Turn features on for everyone, or only for some roles, listed accounts or a share of players. Saved changes take effect within a few seconds.">
      <p className="mb-4 max-w-[80ch] rounded-[var(--radius-m)] border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">
        A flag is on for someone when it is on for everyone, when they hold one of its roles, when their account is listed, or when they fall inside the rollout. The rollout picks accounts by a fixed hash, so raising it only adds people. Every account is a player, so to reach everyone use the switch rather than a role.
      </p>
      {flags.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : flags.error ? (
        <ErrorNotice message="The feature flags could not be loaded." onRetry={() => void flags.refetch()} />
      ) : flags.data && flags.data.flags.length === 0 ? (
        <EmptyState title="No feature flags">Flags are added by the development team and appear here once they exist.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {flags.data?.flags.map((f) => (
            // Remount when the saved flag changes, so the draft starts from what is stored.
            <FlagCard key={`${f.key}:${f.updatedAt}`} flag={f} />
          ))}
        </div>
      )}
    </StaffPage>
  );
}

function FlagCard({ flag }: { flag: FlagRow }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [rollout, setRollout] = useState(String(flag.rolloutPercent));
  const [roles, setRoles] = useState<string[]>(flag.roles);
  const [usersText, setUsersText] = useState(flag.userIds.join('\n'));
  const [saving, setSaving] = useState(false);
  const save = useStaffMutation((v: { patch: FlagPatch; reason: string }) => api.patch(`/api/admin/flags/${encodeURIComponent(flag.key)}`, { ...v.patch, reason: v.reason }), {
    invalidate: [['admin', 'flags']],
    success: `${flag.key} saved`,
    silentError: true,
  });

  const ids = [...new Set(usersText.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const badIds = ids.filter((t) => !UUID.test(t));
  const storedIds = flag.userIds.map((x) => x.toLowerCase());
  const rolloutNum = Number(rollout);
  const rolloutOk = rollout.trim() !== '' && Number.isInteger(rolloutNum) && rolloutNum >= 0 && rolloutNum <= 100;
  const idsOk = badIds.length === 0 && ids.length <= MAX_USERS;

  const patch: FlagPatch = {};
  if (enabled !== flag.enabled) patch.enabled = enabled;
  if (rolloutOk && rolloutNum !== flag.rolloutPercent) patch.rolloutPercent = rolloutNum;
  if (!sameSet(roles, flag.roles)) patch.roles = roles as Role[];
  if (idsOk && !sameSet(ids, storedIds)) patch.userIds = ids;
  const dirty = enabled !== flag.enabled || rollout.trim() !== String(flag.rolloutPercent) || !sameSet(roles, flag.roles) || !sameSet(ids, storedIds);
  const valid = rolloutOk && idsOk;

  const reset = () => {
    setEnabled(flag.enabled);
    setRollout(String(flag.rolloutPercent));
    setRoles(flag.roles);
    setUsersText(flag.userIds.join('\n'));
  };

  const changes: string[] = [];
  if (patch.enabled !== undefined) changes.push(patch.enabled ? 'Turn it on for everyone.' : 'Stop it being on for everyone.');
  if (patch.rolloutPercent !== undefined) changes.push(`Change the rollout from ${flag.rolloutPercent}% to ${patch.rolloutPercent}%.`);
  if (patch.roles) {
    const added = patch.roles.filter((r) => !flag.roles.includes(r));
    const removed = flag.roles.filter((r) => !patch.roles!.includes(r as Role));
    if (added.length) changes.push(`Add the ${listFormat.format(added.map(roleLabel))} ${added.length === 1 ? 'role' : 'roles'}.`);
    if (removed.length) changes.push(`Remove the ${listFormat.format(removed.map(roleLabel))} ${removed.length === 1 ? 'role' : 'roles'}.`);
  }
  if (patch.userIds) {
    const added = patch.userIds.filter((u) => !storedIds.includes(u)).length;
    const removed = storedIds.filter((u) => !patch.userIds!.includes(u)).length;
    if (added) changes.push(`List ${plural(added, 'more account')}.`);
    if (removed) changes.push(`Stop listing ${plural(removed, 'account')}.`);
  }
  const after = { enabled: patch.enabled ?? flag.enabled, rolloutPercent: patch.rolloutPercent ?? flag.rolloutPercent, roles: patch.roles ?? flag.roles, userIds: patch.userIds ?? flag.userIds };
  const roleOptions = ROLES.filter((r) => r !== 'player' || roles.includes('player'));
  const fieldId = `flag-${flag.key.replace(/[^a-z0-9]/gi, '-')}`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-80">
          <h2 className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[15px] font-semibold break-all text-text">{flag.key}</code>
            <FlagState f={flag} />
          </h2>
          <p className="mt-1 text-sm text-text">{flag.description}</p>
          <p className="mt-0.5 text-xs text-text-3">
            {audience(flag)}{' '}
            <span title={dateTime(flag.updatedAt)}>
              Last changed {flag.updatedBy ? `by ${flag.updatedBy}, ` : ''}
              {timeAgo(flag.updatedAt)}.
            </span>
          </p>
        </div>
        <div className="w-full shrink-0 rounded-[12px] border border-line px-3 sm:w-auto sm:min-w-56">
          <Switch checked={enabled} onCheckedChange={setEnabled} label="On for everyone" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-[8.5rem_minmax(0,1fr)] xl:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,20rem)]">
        <Field id={`${fieldId}-rollout`} label="Rollout" hint="Share of other signed-in players" error={rolloutOk ? undefined : 'A whole number from 0 to 100.'}>
          {(p) => (
            <span className="flex items-center gap-2">
              <span className="w-24">
                <Input {...p} type="number" inputMode="numeric" min={0} max={100} step={1} value={rollout} onChange={(e) => setRollout(e.target.value)} />
              </span>
              <span className="text-sm text-text-2">%</span>
            </span>
          )}
        </Field>
        <fieldset className="min-w-0">
          <legend className="text-sm font-semibold text-text">Roles that always get it</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {roleOptions.map((r) => {
              const checked = roles.includes(r);
              return (
                <label
                  key={r}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors ${checked ? 'border-lantern bg-surface-2 text-text' : 'border-line text-text-2 hover:bg-surface-2'}`}
                >
                  <input type="checkbox" className="size-4 accent-[var(--lantern)]" checked={checked} onChange={(e) => setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))} />
                  {ROLE_INFO[r].label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="md:col-span-2 xl:col-span-1">
          <Field
            id={`${fieldId}-users`}
            label="Accounts that always get it"
            hint={`${ids.length ? `${plural(ids.length, 'account')}. ` : ''}Account ids from player pages, one per line or separated by commas. Up to ${MAX_USERS}.`}
            error={badIds.length ? `${badIds.length === 1 ? 'Not an account id' : 'Not account ids'}: ${badIds.slice(0, 3).join(', ')}${badIds.length > 3 ? ` and ${badIds.length - 3} more` : ''}.` : ids.length > MAX_USERS ? `That is ${ids.length} accounts. The limit is ${MAX_USERS}.` : undefined}
          >
            {(p) => <Textarea {...p} rows={2} value={usersText} onChange={(e) => setUsersText(e.target.value)} spellCheck={false} placeholder="None listed" className="min-h-[72px] font-mono text-[13px]" />}
          </Field>
        </div>
      </div>
      {enabled ? <p className="mt-2 text-xs text-text-3">While it is on for everyone, the rollout, roles and accounts make no difference. They still apply if you switch it off again.</p> : null}

      {dirty ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          <span className="mr-auto text-xs font-semibold text-text-2">Unsaved changes</span>
          <Button size="sm" variant="ghost" onClick={reset}>
            Discard changes
          </Button>
          <Button size="sm" variant="primary" onClick={() => setSaving(true)} disabled={!valid || changes.length === 0}>
            Save changes
          </Button>
        </div>
      ) : null}

      <ActionDialog
        open={saving}
        onOpenChange={setSaving}
        title={`Save changes to ${flag.key}`}
        description={
          <span className="flex flex-col gap-2">
            <span className="flex flex-col gap-0.5">
              {changes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </span>
            <span>
              Afterwards: <span className="font-semibold text-text">{audience(after)}</span>
            </span>
          </span>
        }
        confirmLabel="Save changes"
        onSubmit={({ reason }) => save.mutateAsync({ patch, reason })}
      />
    </Card>
  );
}
