import { useEffect, useState, type FormEvent } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { useLocation } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_SCHOOL_DRESS, PASSWORD_RULES, type SchoolDress } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe, type Preferences } from '../../lib/session.ts';
import { ACCESS_DEFAULTS, clearLocalPrefs, localPrefs, applyPreferences, resetDevicePrefs } from '../../lib/prefs.ts';
import { localPrefsChanged, usePrefs } from '../../lib/usePrefs.ts';
import { AccountError, Dialog, Field, Input, PageHeader, Panel, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { matches, SETTINGS, SettingsList } from './AccessSettings.tsx';
import { WhatsNewLink } from '../whatsnew/WhatsNew.tsx';
import { SecretLantern } from '../extras/ExtrasEntry.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { RecoveryCodeDialog } from '../auth/RecoveryCodeDialog.tsx';
import { YourData } from './YourData.tsx';
import { UniformPicker } from '../school/UniformPicker.tsx';
import { schoolLook } from '../../lib/school.ts';
import { useOverview } from '../../lib/queries.ts';
import { ReactionsPanel } from './ReactionsPanel.tsx';

type Patch = Partial<Omit<Preferences, 'notifications' | 'privacy' | 'school'>> & { notifications?: Partial<Preferences['notifications']>; privacy?: Partial<Preferences['privacy']>; school?: Partial<SchoolDress> };

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
  const overview = useOverview();
  const qc = useQueryClient();
  const user = me.data?.user;
  const [query, setQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const prefsApi = usePrefs();
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

  const save = { mutate: (patch: Patch) => prefsApi.save(patch) };
  const resetAll = () => {
    if (user) prefsApi.save({ theme: 'system', reducedMotion: 'system', textSize: 'normal', highContrast: false, sound: true, music: true, access: ACCESS_DEFAULTS });
    else {
      clearLocalPrefs();
      localPrefsChanged();
      applyPreferences(localPrefs());
    }
    resetDevicePrefs();
    setConfirmReset(false);
    toast.success('Settings are back to their defaults');
  };
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
  const shown = SETTINGS.filter((d) => matches(d, query));
  const searchAndList = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input type="search" aria-label="Search settings" placeholder="Search settings, like “timer” or “colour”" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <Button icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setConfirmReset(true)}>
          Back to defaults
        </Button>
      </div>
      <p className="sr-only" role="status">
        {query.trim() ? `${shown.length} ${shown.length === 1 ? 'setting matches' : 'settings match'}` : ''}
      </p>
      {shown.length ? <SettingsList defs={shown} /> : <p className="rounded-[var(--radius-l)] border border-line bg-raised p-5 text-text-2">No settings match “{query.trim()}”. Try another word, like “sound” or “text”.</p>}
      <Panel className="p-5 text-sm text-text-2">
        <h2 className="mb-2 font-display text-xl leading-tight font-bold text-text">Where settings are kept</h2>
        {user ? (
          <p>
            Saved to your account, so they follow you to any device you sign in on: everything here except the volumes, the voice and installing, which stay with this device (marked “This device”). Graphics quality for 3D games is also kept on each device.
          </p>
        ) : (
          <p>You are not signed in, so these settings are kept in this browser on this device only. Sign in and they are saved to your account instead.</p>
        )}
        <div className="mt-3">
          <WhatsNewLink />
        </div>
      </Panel>
      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        size="sm"
        title="Put settings back to their defaults?"
        description="Look and text, read aloud, game, sound and device settings go back to how Ludora starts. Privacy, notifications and your account are not changed."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="primary" onClick={resetAll}>
              Back to defaults
            </Button>
          </>
        }
      />
    </>
  );
  const searching = Boolean(query.trim());
  if (!user) {
    return (
      <>
        <PageHeader title="Settings" description="Changes save as you make them, in this browser." />
        <div className="flex flex-col gap-6">
          <p className="text-sm text-text-2">
            <ButtonLink to="/signin" size="sm" variant="secondary">
              Sign in
            </ButtonLink>{' '}
            to save settings to your account.
          </p>
          {searchAndList}
        </div>
      </>
    );
  }
  const p = user.preferences;
  return (
    <>
      <PageHeader title="Settings" description="Changes save as you make them." />
      <div className="flex flex-col gap-6">
        {schoolLook() === 'hills-grammar' ? (
          <Panel id="uniform" className="flex scroll-mt-20 flex-col gap-4 p-5">
            <div>
              <h2 className="font-display text-2xl leading-tight font-bold">School uniform</h2>
              <p className="text-sm text-text-3">Your Glim wears the Hills Grammar uniform for your year. Other players see the uniform, never your year.</p>
            </div>
            <UniformPicker value={{ ...DEFAULT_SCHOOL_DRESS, ...p.school }} onChange={(school) => save.mutate({ school })} preview={overview.data?.avatar ?? null} />
          </Panel>
        ) : null}
        {searchAndList}
        {searching ? null : (
        <>
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

        <ReactionsPanel value={p.reactionBar ?? []} onSave={(reactionBar) => save.mutate({ reactionBar })} />

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
            className="flex flex-wrap items-start gap-2"
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
            {/* Lined up with the field, not with its hint (the label above the field is 1.625rem). */}
            <Button type="submit" loading={rename.isPending} disabled={!name.trim()} className="sm:mt-[1.625rem]">
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
                className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
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
                <Button type="submit" loading={changePw.isPending} disabled={!pw.currentPassword || !pw.newPassword} className="sm:mt-[1.625rem]">
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
        <YourData username={user.username} isGuest={user.isGuest} />
        <Panel className="flex items-center gap-4 p-5">
          <SecretLantern />
          <div>
            <h2 className="font-display text-2xl leading-tight font-bold">About Ludora</h2>
            <p className="text-sm text-text-2">Made for classrooms. Every lantern has a story, if you know how to ask.</p>
          </div>
        </Panel>
        </>
        )}
      </div>
      <RecoveryCodeDialog code={code} onDone={() => setCode(null)} />
    </>
  );
}
