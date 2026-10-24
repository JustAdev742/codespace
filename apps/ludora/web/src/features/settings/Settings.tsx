import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PASSWORD_RULES } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe, type Preferences } from '../../lib/session.ts';
import { applyPreferences, applyTheme, localTheme } from '../../lib/prefs.ts';
import { AccountError, Field, Input, PageHeader, Panel, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { RecoveryCodeDialog } from '../auth/RecoveryCodeDialog.tsx';

type Patch = Partial<Omit<Preferences, 'notifications' | 'privacy'>> & { notifications?: Partial<Preferences['notifications']>; privacy?: Partial<Preferences['privacy']> };

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  // Thumb-sized on phones, where the control takes the full width under its label; a little smaller on wider screens.
  // The chosen option is lifted out of the groove (a raised fill and a fine edge), not only coloured.
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-m)] border border-line bg-sunken p-1 max-sm:w-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-[var(--radius-s)] px-3.5 text-sm font-semibold transition-colors max-sm:h-11 max-sm:flex-1 ${value === o.value ? 'bg-raised text-text shadow-[0_1px_3px_rgb(2_5_20/0.3)] ring-1 ring-line-strong' : 'text-text-2 hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="font-semibold">{label}</div>
        {description ? <p className="text-sm text-text-3">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const me = useMe();
  const qc = useQueryClient();
  const user = me.data?.user;
  const [localThemeValue, setLocalThemeValue] = useState(localTheme());
  const [name, setName] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [code, setCode] = useState<string | null>(null);
  const { hash } = useLocation();
  const signedIn = Boolean(user);
  // Links such as /settings#privacy land on their panel, which renders once the account has loaded.
  useEffect(() => {
    if (signedIn && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [signedIn, hash]);

  const save = useMutation({
    mutationFn: (patch: Patch) => api.patch<{ preferences: Preferences }>('/api/me/preferences', patch),
    onMutate: (patch) => {
      if (user) applyPreferences({ ...user.preferences, ...patch } as Preferences);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save that setting.'),
  });
  const rename = useMutation({
    mutationFn: () => api.patch('/api/me', { displayName: name }),
    onSuccess: async () => {
      toast.success('Name changed');
      setName('');
      await qc.invalidateQueries();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not change your name.'),
  });
  const changePw = useMutation({
    mutationFn: () => api.post('/api/auth/password', pw),
    onSuccess: () => {
      toast.success('Password changed. Other devices were signed out.');
      setPw({ currentPassword: '', newPassword: '' });
      setPwErrors({});
    },
    onError: (err) => (err instanceof ApiError ? setPwErrors(Object.keys(err.fields).length ? err.fields : { newPassword: err.message }) : toast.error('Could not change your password.')),
  });
  const changeType = useMutation({
    mutationFn: (accountType: string) => api.patch('/api/me/account-type', { accountType }),
    onSuccess: async () => {
      toast.success('Account type changed');
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not change your account type.'),
  });
  const newCode = useMutation({
    mutationFn: () => api.post<{ recoveryCode: string }>('/api/auth/recovery-code'),
    onSuccess: (r) => setCode(r.recoveryCode),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not make a new code.'),
  });

  // A signed-in player must not see the signed-out page while their account loads, or if it fails to.
  if (me.isLoading) {
    return (
      <>
        <PageHeader title="Settings" description="Changes save as you make them." />
        <div className="flex flex-col gap-6" aria-busy="true">
          <span role="status" className="sr-only">
            Loading your settings
          </span>
          <Skeleton className="h-80 rounded-[var(--radius-m)]" />
          <Skeleton className="h-64 rounded-[var(--radius-m)]" />
        </div>
      </>
    );
  }
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Settings" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!user) {
    return (
      <>
        <PageHeader title="Settings" />
        <Panel className="p-5">
          <Row label="Theme" description="Saved in this browser.">
            <Segmented
              label="Theme"
              value={localThemeValue}
              onChange={(v) => {
                setLocalThemeValue(v);
                applyTheme(v);
              }}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Day' },
                { value: 'dark', label: 'Night' },
              ]}
            />
          </Row>
          <p className="mt-2 text-sm text-text-3">
            <ButtonLink to="/signin" size="sm" variant="secondary">
              Sign in
            </ButtonLink>{' '}
            to save settings to your account.
          </p>
        </Panel>
      </>
    );
  }
  const p = user.preferences;
  return (
    <>
      <PageHeader title="Settings" description="Changes save as you make them." />
      <div className="flex flex-col gap-6">
        <Panel className="divide-y divide-line px-5 py-2">
          <h2 className="py-3 font-display text-2xl leading-tight font-bold">Appearance and accessibility</h2>
          <Row label="Theme">
            <Segmented label="Theme" value={p.theme} onChange={(v) => save.mutate({ theme: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Day' }, { value: 'dark', label: 'Night' }]} />
          </Row>
          <Row label="Motion" description="Less motion turns off animations and slides, pack openings included.">
            <Segmented label="Motion" value={p.reducedMotion} onChange={(v) => save.mutate({ reducedMotion: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'on', label: 'Less' }, { value: 'off', label: 'Full' }]} />
          </Row>
          <Row label="Text size">
            <Segmented label="Text size" value={p.textSize} onChange={(v) => save.mutate({ textSize: v })} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }, { value: 'larger', label: 'Larger' }]} />
          </Row>
          <div>
            <Switch checked={p.highContrast} onCheckedChange={(v) => save.mutate({ highContrast: v })} label="High contrast" description="Stronger borders and text." />
          </div>
          <div>
            <Switch checked={p.sound} onCheckedChange={(v) => save.mutate({ sound: v })} label="Sound effects" description="Answers, the timer, results and opening Lanterns." />
          </div>
          <div>
            <Switch checked={p.music} onCheckedChange={(v) => save.mutate({ music: v })} label="Music" description="Plays on the host's screen and in solo games, never on players' phones." />
          </div>
        </Panel>

        <Panel id="privacy" className="scroll-mt-20 divide-y divide-line px-5 py-2">
          <h2 className="py-3 font-display text-2xl leading-tight font-bold">Privacy</h2>
          <Row label="Who can see my profile">
            <Select aria-label="Who can see my profile" value={p.privacy.profileVisibility} onChange={(e) => save.mutate({ privacy: { profileVisibility: e.target.value as Preferences['privacy']['profileVisibility'] } })} className="w-44">
              <option value="public">Everyone</option>
              <option value="friends">Friends only</option>
              <option value="private">Only me</option>
            </Select>
          </Row>
          <Row label="Who can send friend requests">
            <Select aria-label="Who can send friend requests" value={p.privacy.allowFriendRequests} onChange={(e) => save.mutate({ privacy: { allowFriendRequests: e.target.value as Preferences['privacy']['allowFriendRequests'] } })} className="w-44">
              <option value="everyone">Anyone</option>
              <option value="friend_code">People with my friend code</option>
              <option value="nobody">Nobody</option>
            </Select>
          </Row>
          <div>
            <Switch checked={p.privacy.showOnLeaderboards} onCheckedChange={(v) => save.mutate({ privacy: { showOnLeaderboards: v } })} label="Show me on public leaderboards" description="Only your display name and buddy are ever shown." />
          </div>
          <Row label="My friend code" description="Share it with friends so they can add you.">
            <code className="font-display text-2xl font-bold tracking-wider tabular">{user.friendCode}</code>
          </Row>
        </Panel>

        <Panel className="divide-y divide-line px-5 py-2">
          <h2 className="py-3 font-display text-2xl leading-tight font-bold">Notifications</h2>
          <div>
            <Switch checked={p.notifications.friendRequests} onCheckedChange={(v) => save.mutate({ notifications: { friendRequests: v } })} label="Friend requests" />
          </div>
          <div>
            <Switch checked={p.notifications.gameInvites} onCheckedChange={(v) => save.mutate({ notifications: { gameInvites: v } })} label="Game invites" />
          </div>
          <div>
            <Switch checked={p.notifications.rewards} onCheckedChange={(v) => save.mutate({ notifications: { rewards: v } })} label="Rewards and quests" />
          </div>
        </Panel>

        <Panel id="account" className="flex scroll-mt-20 flex-col gap-5 p-5">
          <h2 className="font-display text-2xl leading-tight font-bold">Account</h2>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (name.trim()) rename.mutate();
            }}
          >
            <div className="min-w-[14rem] flex-1">
              <Field label="Display name" hint={`Currently "${user.displayName}". You can change it once a day.`}>
                {(fp) => <Input {...fp} value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={user.displayName} />}
              </Field>
            </div>
            <Button type="submit" loading={rename.isPending} disabled={!name.trim()}>
              Change name
            </Button>
          </form>
          {user.isGuest ? (
            <div className="rounded-[var(--radius-m)] border border-lantern/60 bg-lantern/[0.06] p-4">
              <p className="text-sm text-text-2">Guest accounts have no password. Save your progress to an account to sign in anywhere.</p>
              <ButtonLink to="/signup" variant="primary" size="sm" className="mt-3">
                Save my progress
              </ButtonLink>
            </div>
          ) : (
            <>
              <div className="max-w-sm">
                <Field label="Account type" hint="Teacher accounts can make classes and set assignments. Everyone plays the same games.">
                  {(fp) => (
                    <Select {...fp} value={user.accountType} disabled={changeType.isPending} onChange={(e) => changeType.mutate(e.target.value)}>
                      <option value="player">Player</option>
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                    </Select>
                  )}
                </Field>
              </div>
              <form
                className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  changePw.mutate();
                }}
              >
                <Field label="Current password" error={pwErrors.currentPassword}>
                  {(fp) => <Input {...fp} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((s) => ({ ...s, currentPassword: e.target.value }))} />}
                </Field>
                <Field label="New password" hint={PASSWORD_RULES} error={pwErrors.newPassword}>
                  {(fp) => <Input {...fp} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((s) => ({ ...s, newPassword: e.target.value }))} />}
                </Field>
                <Button type="submit" loading={changePw.isPending} disabled={!pw.currentPassword || !pw.newPassword}>
                  Change password
                </Button>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-2">Lost your recovery code? Make a new one. The old one stops working.</p>
                <Button size="sm" loading={newCode.isPending} onClick={() => newCode.mutate()}>
                  New recovery code
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>
      <RecoveryCodeDialog code={code} onDone={() => setCode(null)} />
    </>
  );
}
