import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Play, RotateCcw, UserPlus, X } from 'lucide-react';
import { QA_SCENARIOS, QA_SCENARIO_INFO, RESET_SCOPES, RESET_SCOPE_INFO, TEST_GRANT_MAX, displayNameSchema, type QaScenario, type ResetScope } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { Amount, Badge, EmptyState, ErrorNotice, Field, Input, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, KeyValues, SecretDialog, StaffPage, StatusPill, dateTime, useStaffMutation, type Column } from './ui.tsx';
import { AGE_BAND_LABEL, AccountSearch, MovementDialog, accountName, currencyName, parseWhole, useCurrencyChoices, useQueryParams, wholeError, type StaffUser } from './Economy.tsx';

/*
 * Testing tools. Everything here acts on test accounts only (the server
 * refuses anything else): create them, top them up, reset them, put them
 * into a known state with a QA scenario, and give unlimited currency.
 * Super administrators can also turn an existing account into a test
 * account and back.
 */

interface TestingInfo {
  environment: 'development' | 'test' | 'sandbox' | 'production';
  scenariosEnabled: boolean;
  canGrantUnlimited: boolean;
  canConvertAccounts: boolean;
}

interface TestAccount extends StaffUser {
  balances: Record<string, number>;
  entitlements: { kind: string; expiresAt: string | null }[];
}

const ENV_LABEL: Record<TestingInfo['environment'], string> = { production: 'Production', sandbox: 'Sandbox', development: 'Development', test: 'Automated test environment' };
const ACCOUNT_TYPES = [
  { value: 'player', label: 'Player', hint: 'An ordinary player account.' },
  { value: 'student', label: 'Student', hint: 'For trying class and assignment flows.' },
  { value: 'teacher', label: 'Teacher', hint: 'Can host games and run classes.' },
] as const;
const AGES = [
  { value: 'adult', label: 'Adult', hint: 'Set up as a 25-year-old.' },
  { value: 'teen', label: 'Teen (13 to 17)', hint: 'Set up as a 15-year-old.' },
  { value: 'child', label: 'Child (under 13)', hint: 'Set up as a 10-year-old, with the under-13 defaults: profile visible to friends only, friend requests by friend code only.' },
] as const;
const SCOPE_WORD: Record<ResetScope, string> = { economy: 'wallet', inventory: 'collection', progression: 'progress' };

const testKey = ['admin', 'testing', 'accounts'] as const;

function unlimitedOf(a: TestAccount) {
  return a.entitlements.find((e) => e.kind === 'unlimited_currency') ?? null;
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export default function Testing() {
  const info = useQuery({ queryKey: ['admin', 'testing', 'info'], queryFn: () => api.get<TestingInfo>('/api/admin/testing/info'), staleTime: 60_000 });
  const accounts = useQuery({ queryKey: testKey, queryFn: () => api.get<{ accounts: TestAccount[] }>('/api/admin/testing/accounts') });
  const [params, patch] = useQueryParams();
  const selectedId = params.get('account') ?? '';
  const selected = accounts.data?.accounts.find((a) => a.id === selectedId) ?? null;
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { choices } = useCurrencyChoices();

  const select = (id: string | null) => patch({ account: id });
  const shownId = selected?.id;
  useEffect(() => {
    if (shownId) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [shownId]);

  const cols: Column<TestAccount>[] = [
    {
      key: 'account',
      header: 'Account',
      cell: (a) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold">
            {accountName(a)}
            <Badge tone="sky">Test</Badge>
            {a.status !== 'active' ? <StatusPill status={a.status} /> : null}
          </div>
          <div className="text-xs text-text-3">{a.displayName}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (a) => (
        <span className="text-text-2">
          {ACCOUNT_TYPES.find((t) => t.value === a.accountType)?.label ?? a.accountType}
          {a.ageBand ? <span className="block text-xs text-text-3">{AGE_BAND_LABEL[a.ageBand] ?? a.ageBand}</span> : null}
        </span>
      ),
    },
    { key: 'level', header: 'Level', align: 'right', cell: (a) => a.level },
    {
      key: 'balances',
      header: 'Balances',
      cell: (a) => {
        const held = Object.entries(a.balances).filter(([, v]) => v > 0);
        return held.length ? (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {held.map(([code, v]) => (
              <Amount key={code} currency={code} value={v} size="sm" />
            ))}
          </span>
        ) : (
          <span className="text-text-3">Nothing</span>
        );
      },
    },
    {
      key: 'unlimited',
      header: 'Unlimited currency',
      cell: (a) => {
        const u = unlimitedOf(a);
        return u ? <Badge tone="violet">{u.expiresAt ? `Until ${dateTime(u.expiresAt)}` : 'On'}</Badge> : <span className="text-text-3">Off</span>;
      },
    },
    { key: 'created', header: 'Created', cell: (a) => <span className="whitespace-nowrap text-text-2">{dateTime(a.createdAt)}</span> },
    {
      key: 'manage',
      header: 'Actions',
      align: 'right',
      cell: (a) => (
        <Button size="sm" variant={a.id === selectedId ? 'primary' : 'secondary'} aria-pressed={a.id === selectedId} onClick={() => select(a.id)}>
          {a.id === selectedId ? 'Selected' : 'Manage'}
        </Button>
      ),
    },
  ];

  return (
    <StaffPage
      title="Testing"
      description="Test accounts for trying flows end to end. They carry a Test label everywhere staff see them, and they are left out of economy figures and analytics. These tools refuse to touch any account that is not a test account."
      actions={
        <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
          Create test account
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {info.isError ? (
          <ErrorNotice message="Could not check what the testing tools allow here." onRetry={() => void info.refetch()} />
        ) : info.data ? (
          <EnvironmentNotice info={info.data} />
        ) : (
          <Skeleton className="h-20" />
        )}

        {selectedId && accounts.data && !selected ? (
          <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-m)] border border-ember/50 bg-ember/10 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-text">That account is not a test account</p>
              <p className="text-text-2">The link pointed at an account that is not on the test account list, so these tools cannot change it.{info.data?.canConvertAccounts ? ' You can turn it into a test account below.' : ''}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => select(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {selected && info.data ? (
          <div ref={panelRef} className="scroll-mt-24">
            <AccountPanel account={selected} info={info.data} onClose={() => select(null)} choices={choices} />
          </div>
        ) : null}

        <Card title={accounts.data ? `Test accounts (${formatNumber(accounts.data.accounts.length)})` : 'Test accounts'}>
          <p className="-mt-1 mb-3 text-sm text-text-3">Newest first, up to 200. Choose Manage to top up, reset or set up an account.</p>
          {accounts.data && !accounts.data.accounts.length ? (
            <EmptyState
              icon={<FlaskConical className="size-8" />}
              title="No test accounts yet"
              action={
                <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
                  Create test account
                </Button>
              }
            >
              Create one to try the shop, Lanterns, quests or classes without touching a real player's account.
            </EmptyState>
          ) : (
            <DataTable columns={cols} rows={accounts.data?.accounts} rowKey={(a) => a.id} loading={accounts.isLoading} error={accounts.error} onRetry={() => void accounts.refetch()} minWidth={760} caption="Test accounts" />
          )}
        </Card>

        {info.data?.canConvertAccounts ? <ConvertCard initialId={selectedId && accounts.data && !selected ? selectedId : ''} /> : null}
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(res) => {
          setSecret({ username: res.username, password: res.password });
          select(res.account.id);
        }}
      />
      <SecretDialog
        open={Boolean(secret)}
        onOpenChange={(v) => !v && setSecret(null)}
        title="Test account created"
        description="This password is shown once and is not stored anywhere you can read it again, so copy it now. To play as this account, sign in with these details in a private window."
        values={secret ? [['Username', secret.username], ['Password', secret.password]] : []}
      />
    </StaffPage>
  );
}

function EnvironmentNotice({ info }: { info: TestingInfo }) {
  const prod = info.environment === 'production';
  return (
    <div role="note" className={`rounded-[var(--radius-m)] border px-4 py-3 text-sm ${prod ? 'border-ember/60 bg-ember/10' : 'border-line bg-raised'}`}>
      <p className="font-semibold text-text">{ENV_LABEL[info.environment] ?? info.environment}: what the testing tools can do here</p>
      <ul className="mt-1 list-disc pl-5 text-text-2">
        <li>{info.scenariosEnabled ? 'QA scenarios are on.' : 'QA scenarios are switched off in production. Use the sandbox to set an account up in a known state.'}</li>
        <li>
          {info.canGrantUnlimited
            ? prod
              ? 'You can give test accounts unlimited currency. In production only super administrators can.'
              : 'You can give test accounts unlimited currency.'
            : 'Unlimited currency can only be given by super administrators in production.'}
        </li>
        <li>{info.canConvertAccounts ? 'You can turn an existing account into a test account and back.' : 'Turning an existing account into a test account needs a super administrator.'}</li>
      </ul>
    </div>
  );
}

/* ------------------------------ one account ------------------------------- */

function AccountPanel({ account, info, onClose, choices }: { account: TestAccount; info: TestingInfo; onClose: () => void; choices: { code: string; name: string }[] }) {
  const canUsers = useCan('users.read');
  const [move, setMove] = useState<{ open: boolean; direction: 'grant' | 'revoke' }>({ open: false, direction: 'grant' });
  const [resetOpen, setResetOpen] = useState(false);
  const [scenario, setScenario] = useState<QaScenario | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [unlimitedOpen, setUnlimitedOpen] = useState(false);
  const name = accountName(account);
  const unlimited = unlimitedOf(account);
  const codes = [...new Set([...choices.map((c) => c.code), ...Object.keys(account.balances)])];
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {name}
          <Badge tone="sky">Test account</Badge>
        </span>
      }
      actions={
        <>
          {canUsers ? (
            <ButtonLink to={`/staff/users/${account.id}`} size="sm" variant="ghost">
              Open player page
            </ButtonLink>
          ) : null}
          <IconButton label="Close this account" size="sm" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </>
      }
      className="border-sky/40"
    >
      <div className="flex flex-col gap-5">
        <KeyValues
          items={[
            ['Display name', account.displayName],
            ['Account type', ACCOUNT_TYPES.find((t) => t.value === account.accountType)?.label ?? account.accountType],
            ['Age band', account.ageBand ? (AGE_BAND_LABEL[account.ageBand] ?? account.ageBand) : 'Not set'],
            ['Level', String(account.level)],
            ['Created', dateTime(account.createdAt)],
            ['Last seen', account.lastSeenAt ? dateTime(account.lastSeenAt) : 'Never signed in'],
          ]}
        />

        <section aria-labelledby="test-balances-h">
          <h3 id="test-balances-h" className="mb-2 font-sans text-sm font-semibold text-text">
            Balances
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {codes.map((code) => (
              <li key={code} className="flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line px-3 py-2">
                <span className="min-w-0 truncate text-sm text-text-2">{currencyName(choices, code)}</span>
                <Amount currency={code} value={account.balances[code] ?? 0} size="sm" />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setMove({ open: true, direction: 'grant' })}>
              Grant currency or items
            </Button>
            <Button onClick={() => setMove({ open: true, direction: 'revoke' })}>Remove currency or items</Button>
            <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>
              Reset account
            </Button>
          </div>
          <p className="mt-2 text-xs text-text-3">Up to {formatNumber(TEST_GRANT_MAX)} of a currency in one change. No typed confirmation for test accounts; everything is still audited.</p>
        </section>

        <section aria-labelledby="test-unlimited-h">
          <h3 id="test-unlimited-h" className="mb-1 font-sans text-sm font-semibold text-text">
            Unlimited currency
          </h3>
          <p className="mb-2 text-sm text-text-2">
            {unlimited
              ? `On${unlimited.expiresAt ? ` until ${dateTime(unlimited.expiresAt)}` : ''}. Shop purchases, Lanterns and crafting cost nothing; the ledger marks each one as covered by unlimited test currency.`
              : 'Off. With it on, shop purchases, Lanterns and crafting cost nothing, which is handy for checking odds or the shop without topping up.'}
          </p>
          {info.canGrantUnlimited ? (
            <Button variant={unlimited ? 'secondary' : 'primary'} onClick={() => setUnlimitedOpen(true)}>
              {unlimited ? 'Switch off unlimited currency' : 'Give unlimited currency'}
            </Button>
          ) : (
            <p className="text-xs text-text-3">Only super administrators can change this in production.</p>
          )}
        </section>

        <section aria-labelledby="test-scenarios-h">
          <h3 id="test-scenarios-h" className="mb-1 font-sans text-sm font-semibold text-text">
            QA scenarios
          </h3>
          <p className="mb-3 text-sm text-text-2">{info.scenariosEnabled ? 'Put this account into a known state in one step.' : 'Switched off in production so nobody can reshape accounts here. Run scenarios in the sandbox.'}</p>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {QA_SCENARIOS.map((s) => (
              <li key={s} className="flex min-w-0 flex-col justify-between gap-2 rounded-[var(--radius-m)] border border-line p-3">
                <div>
                  <div className="font-semibold text-text">{QA_SCENARIO_INFO[s].label}</div>
                  <p className="text-sm text-text-2">{QA_SCENARIO_INFO[s].description}</p>
                </div>
                <div>
                  <Button
                    size="sm"
                    icon={<Play className="size-3.5" />}
                    disabled={!info.scenariosEnabled}
                    aria-label={`Run ${QA_SCENARIO_INFO[s].label} on ${name}`}
                    onClick={() => {
                      setScenario(s);
                      setScenarioOpen(true);
                    }}
                  >
                    Run scenario
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <MovementDialog open={move.open} onOpenChange={(v) => setMove((m) => ({ ...m, open: v }))} direction={move.direction} target={{ id: account.id, name, isTest: true, confirmWord: null, balances: account.balances }} mode="test" />
      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} account={account} />
      {scenario ? <ScenarioDialog open={scenarioOpen} onOpenChange={setScenarioOpen} account={account} scenario={scenario} /> : null}
      <UnlimitedDialog open={unlimitedOpen} onOpenChange={setUnlimitedOpen} account={account} on={Boolean(unlimited)} />
    </Card>
  );
}

function ResetDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (v: boolean) => void; account: TestAccount }) {
  const [scopes, setScopes] = useState<ResetScope[]>([...RESET_SCOPES]);
  useEffect(() => {
    if (open) setScopes([...RESET_SCOPES]);
  }, [open]);
  const name = accountName(account);
  const reset = useStaffMutation((body: { scopes: ResetScope[]; reason: string; confirm?: string }) => api.post(`/api/admin/testing/accounts/${account.id}/reset`, body), {
    silentError: true,
    success: (_r, b) => `Reset ${listWords(b.scopes.map((s) => SCOPE_WORD[s]))} for ${name}.`,
    invalidate: [testKey, ['admin', 'wallet'], ['admin', 'economy']],
  });
  const ordered = RESET_SCOPES.filter((s) => scopes.includes(s));
  const all = ordered.length === RESET_SCOPES.length;
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reset ${name}`}
      description="Takes the parts you choose back to a fresh state. This cannot be undone."
      confirmWord={account.username ?? account.displayName}
      confirmLabel={ordered.length ? `Reset ${listWords(ordered.map((s) => SCOPE_WORD[s]))}` : 'Reset account'}
      variant="danger"
      disabled={!ordered.length}
      onSubmit={async ({ reason, confirm }) => {
        await reset.mutateAsync({ scopes: ordered, reason, ...(confirm !== undefined ? { confirm } : {}) });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-text">What to reset</legend>
        {RESET_SCOPES.map((s) => (
          <label key={s} className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-m)] border border-line p-3 has-[:checked]:border-lantern">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-[var(--lantern)]"
              checked={scopes.includes(s)}
              onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
            />
            <span className="min-w-0">
              <span className="block font-semibold text-text">{RESET_SCOPE_INFO[s].label}</span>
              <span className="block text-sm text-text-2">{RESET_SCOPE_INFO[s].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-text-2">{all ? 'With all three, the account also gets the welcome Sparks and starter Glims again, like a brand-new player.' : 'Anything you leave unticked stays as it is.'}</p>
    </ActionDialog>
  );
}

type ScenarioResult = { ok: true; scenario: QaScenario } & Record<string, unknown>;

function scenarioSummary(res: ScenarioResult, name: string): string {
  const n = (k: string) => formatNumber(Number(res[k] ?? 0));
  switch (res.scenario) {
    case 'fresh':
      return `${name} is a brand-new player again, with the welcome gift.`;
    case 'wealthy':
      return `Added ${n('sparks')} Sparks, ${n('moonstones')} Moonstones and ${n('dust')} Glow Dust to ${name}.`;
    case 'almost_complete':
      return `Gave ${name} ${plural(Number(res.granted ?? 0), 'Meadow Glim')}.${res.missing ? ` Still missing: ${String(res.missing)}.` : ''}`;
    case 'every_cosmetic':
      return `Gave ${name} ${plural(Number(res.granted ?? 0), 'cosmetic')} they did not have.`;
    case 'level_up_ready':
      return `${name} is one XP away from level ${Number(res.level ?? 0) + 1}.`;
    case 'streak_six':
      return `${name} has a six-day streak; their next game pays the weekly bonus.`;
    case 'pity_ready':
      return `The guarantee is due on ${plural(Number(res.lanterns ?? 0), 'Lantern')} for ${name}.`;
    default:
      return `Scenario done for ${name}.`;
  }
}

function ScenarioDialog({ open, onOpenChange, account, scenario }: { open: boolean; onOpenChange: (v: boolean) => void; account: TestAccount; scenario: QaScenario }) {
  const name = accountName(account);
  const run = useStaffMutation((body: { scenario: QaScenario; reason: string }) => api.post<ScenarioResult>(`/api/admin/testing/accounts/${account.id}/scenario`, body), {
    silentError: true,
    success: (res) => scenarioSummary(res, name),
    invalidate: [testKey, ['admin', 'wallet'], ['admin', 'economy']],
  });
  const info = QA_SCENARIO_INFO[scenario];
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${info.label}: ${name}`}
      description={info.description}
      confirmLabel="Run scenario"
      reasonHint="Saved in the audit log, for example the ticket or flow you are testing."
      onSubmit={async ({ reason }) => {
        await run.mutateAsync({ scenario, reason });
      }}
    >
      {scenario === 'fresh' ? <p className="text-sm text-text-2">This wipes the wallet, collection and progress first.</p> : null}
    </ActionDialog>
  );
}

function UnlimitedDialog({ open, onOpenChange, account, on }: { open: boolean; onOpenChange: (v: boolean) => void; account: TestAccount; on: boolean }) {
  const [days, setDays] = useState('30');
  useEffect(() => {
    if (open) setDays('30');
  }, [open]);
  const name = accountName(account);
  const n = parseWhole(days, 1, 90);
  const change = useStaffMutation((body: { kind: 'unlimited_currency'; grant: boolean; days?: number; reason: string }) => api.post(`/api/admin/testing/accounts/${account.id}/entitlements`, body), {
    silentError: true,
    success: (_r, b) => (b.grant ? `${name} has unlimited currency for ${plural(b.days ?? 30, 'day')}.` : `Unlimited currency is off for ${name}.`),
    invalidate: [testKey],
  });
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={on ? `Switch off unlimited currency for ${name}` : `Give ${name} unlimited currency`}
      description={on ? 'Spending costs currency again straight away.' : 'Shop purchases, Lanterns and crafting cost nothing until it ends. Only works on test accounts.'}
      confirmLabel={on ? 'Switch off unlimited currency' : n ? `Give unlimited currency for ${plural(n, 'day')}` : 'Give unlimited currency'}
      variant={on ? 'danger' : 'primary'}
      disabled={!on && n === null}
      onSubmit={async ({ reason }) => {
        await change.mutateAsync(on ? { kind: 'unlimited_currency', grant: false, reason } : { kind: 'unlimited_currency', grant: true, days: n ?? 30, reason });
      }}
    >
      {!on ? (
        <Field label="Days" error={days && n === null ? wholeError(1, 90) : undefined} hint="From 1 to 90. It switches itself off afterwards.">
          {(p) => <Input {...p} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} autoComplete="off" />}
        </Field>
      ) : null}
    </ActionDialog>
  );
}

/* ------------------------------ create account ------------------------------ */

interface CreateResult {
  ok: true;
  account: StaffUser;
  username: string;
  password: string;
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (res: CreateResult) => void }) {
  const [accountType, setAccountType] = useState<string>('player');
  const [age, setAge] = useState<string>('adult');
  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    if (open) {
      setAccountType('player');
      setAge('adult');
      setDisplayName('');
    }
  }, [open]);
  const nameCheck = displayName.trim() ? displayNameSchema.safeParse(displayName) : null;
  const nameError = nameCheck && !nameCheck.success ? (nameCheck.error.issues[0]?.message ?? 'Pick a different name.') : undefined;
  const create = useStaffMutation((body: Record<string, unknown>) => api.post<CreateResult>('/api/admin/testing/accounts', body), {
    silentError: true,
    invalidate: [testKey],
    onSuccess: (res) => onCreated(res),
  });
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a test account"
      description="It gets a qa_ username, the welcome gift and the Test label. You will see its password once."
      confirmLabel="Create test account"
      disabled={Boolean(nameError)}
      onSubmit={async ({ reason }) => {
        await create.mutateAsync({ accountType, age, ...(displayName.trim() ? { displayName: displayName.trim() } : {}), reason });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account type" hint={ACCOUNT_TYPES.find((t) => t.value === accountType)?.hint}>
          {(p) => (
            <Select {...p} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Age band" hint={AGES.find((a) => a.value === age)?.hint}>
          {(p) => (
            <Select {...p} value={age} onChange={(e) => setAge(e.target.value)}>
              {AGES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Display name (optional)" error={nameError} hint="Leave empty for a name like Test Otter.">
        {(p) => <Input {...p} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} autoComplete="off" />}
      </Field>
    </ActionDialog>
  );
}

/* ----------------------------- convert accounts ----------------------------- */

function ConvertCard({ initialId }: { initialId: string }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [open, setOpen] = useState(false);
  const flag = useStaffMutation((body: { id: string; isTest: boolean; reason: string; confirm?: string }) => api.post(`/api/admin/testing/accounts/${body.id}/test-flag`, { isTest: body.isTest, reason: body.reason, confirm: body.confirm }), {
    silentError: true,
    success: (_r, b) => (b.isTest ? `${user ? accountName(user) : 'The account'} is now a test account.` : `${user ? accountName(user) : 'The account'} is a real account again.`),
    invalidate: [testKey, ['admin', 'users'], ['admin', 'wallet']],
    onSuccess: (_r, b) => setUser((u) => (u ? { ...u, isTestAccount: b.isTest } : u)),
  });
  const name = user ? accountName(user) : '';
  return (
    <Card title="Turn an existing account into a test account, or back">
      <p className="-mt-1 mb-3 max-w-[70ch] text-sm text-text-2">
        For accounts staff already use for testing. A test account gets the Test label everywhere, drops out of economy figures and analytics, and these tools can change it. Guest accounts cannot become test accounts, and you can only change accounts with a lower staff role than yours.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountSearch
          key={initialId}
          kind="registered"
          initialQuery={initialId}
          selectedId={user?.id}
          onPick={(_id, u) => {
            if (u) setUser(u);
            void qc.invalidateQueries({ queryKey: ['admin', 'users', 'search'] });
          }}
        />
        <div className="min-w-0">
          {user ? (
            <div className="flex flex-col gap-3 rounded-[var(--radius-m)] border border-line p-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 font-semibold text-text">
                  {name}
                  {user.isTestAccount ? <Badge tone="sky">Test</Badge> : <Badge>Real account</Badge>}
                  {user.roles.map((r) => (
                    <Badge key={r} tone="violet">
                      {r}
                    </Badge>
                  ))}
                </div>
                <div className="text-sm text-text-3">
                  {user.displayName} · {user.accountType} · created {dateTime(user.createdAt)}
                </div>
              </div>
              <div>
                <Button variant={user.isTestAccount ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
                  {user.isTestAccount ? 'Make it a real account again' : 'Make it a test account'}
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState title="No account chosen">Search for the account to convert.</EmptyState>
          )}
        </div>
      </div>
      {user ? (
        <ActionDialog
          open={open}
          onOpenChange={setOpen}
          title={user.isTestAccount ? `Make ${name} a real account again` : `Make ${name} a test account`}
          description={
            user.isTestAccount
              ? 'Its unlimited currency and any other test entitlements end straight away. Balances and items stay as they are, and it counts in economy figures again.'
              : 'Testing tools will be able to reset it and change its balances, and it will no longer count in economy figures or analytics.'
          }
          confirmWord={user.username ?? user.displayName}
          confirmLabel={user.isTestAccount ? 'Make it a real account' : 'Make it a test account'}
          variant={user.isTestAccount ? 'primary' : 'danger'}
          onSubmit={async ({ reason, confirm }) => {
            await flag.mutateAsync({ id: user.id, isTest: !user.isTestAccount, reason, ...(confirm !== undefined ? { confirm } : {}) });
          }}
        />
      ) : null}
    </Card>
  );
}
