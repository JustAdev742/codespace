import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Download, Search, Star, Tag, Undo2 } from 'lucide-react';
import { SHOP_SECTION_INFO, realGrantCap, type ShopSection } from '@ludora/shared';
import { api, newRequestKey } from '../../lib/api.ts';
import { calmUntil, formatDate, formatDay, formatNumber, plural } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { CurrencyIcon } from '../../art/icons.tsx';
import { Amount, Badge, ErrorNotice, Field, Input, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, OlderButton, Stat, dateTime, useDebounced, useStaffMutation, type Column } from './ui.tsx';
import {
  DateTimeField,
  LanternOddsBlock,
  Segmented,
  TimeCell,
  currencyName,
  isoToLocalInput,
  localInputToIso,
  parseWhole,
  reasonLabel,
  useCurrencyChoices,
  wholeError,
  type EconomyRules,
  type OverviewData,
} from './Economy.tsx';

/*
 * The economy room's own parts (D58): health, the rules preview and history, the Sparks boost,
 * sales and featured listings, refunds, class grants, the daily grant limit and the economy's
 * history. Every number comes from the server, which reads it from the ledger, purchases and
 * wallets; none is made up here. Each table has a plain sentence above it saying what it shows.
 */

const sectionLabel = (s: string) => SHOP_SECTION_INFO[s as ShopSection]?.label ?? s;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatNumber(Math.abs(n))}`;

/** A thin bar beside a number, for comparing rows at a glance. Hidden from screen readers, which read the number. */
function Bar({ value, max, tone }: { value: number; max: number; tone: 'in' | 'out' | 'plain' }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  const fill = tone === 'in' ? 'bg-glim/70' : tone === 'out' ? 'bg-ember/70' : 'bg-lantern/70';
  return (
    <div className="mt-1 h-1.5 w-full min-w-16 rounded-full bg-surface-3" aria-hidden>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The sentence above a table. */
function Summary({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-[75ch] text-[15px] text-text-2">{children}</p>;
}

/* ================================== health ================================== */

interface Health {
  days: number;
  since: string;
  cap: number;
  dayList: string[];
  perDay: { day: string; currency: string; earned: number; spent: number }[];
  byReason: { currency: string; reason: string; earned: number; spent: number; entries: number }[];
  bands: { label: string; min: number; max: number | null; players: number }[];
  medianSparks: number | null;
  players: number;
  mostBought: { id: string; name: string; section: string; currency: string; bought: number; spent: number }[];
  leastBought: { id: string; name: string; section: string; currency: string; bought: number; spent: number }[];
  capHits: { day: string; capped: number; earners: number }[];
  cappedToday: number;
}

export function HealthTab() {
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const [currency, setCurrency] = useState('sparks');
  const { choices } = useCurrencyChoices();
  const q = useQuery({ queryKey: ['admin', 'economy', 'health', days], queryFn: () => api.get<Health>(`/api/admin/economy/health?days=${days}`), placeholderData: (p) => p });
  const overview = useQuery({ queryKey: ['admin', 'economy', 'overview'], queryFn: () => api.get<OverviewData>('/api/admin/economy/overview') });
  if (q.isError) return <ErrorNotice message="The economy's health did not load." onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span role="status" className="sr-only">
          Loading the economy's health
        </span>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  const d = q.data;
  const name = currencyName(choices, currency);
  const circulating = overview.data?.currencies.find((c) => c.code === currency);
  const rows = d.dayList.map((day) => {
    const r = d.perDay.find((x) => x.day === day && x.currency === currency);
    const cap = d.capHits.find((c) => c.day === day);
    return { day, earned: r?.earned ?? 0, spent: r?.spent ?? 0, capped: cap?.capped ?? 0, earners: cap?.earners ?? 0 };
  });
  const earned = rows.reduce((n, r) => n + r.earned, 0);
  const spent = rows.reduce((n, r) => n + r.spent, 0);
  const maxDay = Math.max(1, ...rows.flatMap((r) => [r.earned, r.spent]));
  const sources = d.byReason.filter((r) => r.currency === currency && r.earned > 0).sort((a, b) => b.earned - a.earned);
  const sinks = d.byReason.filter((r) => r.currency === currency && r.spent > 0).sort((a, b) => b.spent - a.spent);
  const topSource = sources[0];
  const topSink = sinks[0];
  const busiest = [...rows].sort((a, b) => b.earned - a.earned)[0];
  const capDays = rows.filter((r) => r.capped > 0).length;
  const maxBand = Math.max(1, ...d.bands.map((b) => b.players));
  const biggestBand = [...d.bands].sort((a, b) => b.players - a.players)[0];
  const periodText = `the last ${d.days} days`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <Segmented
            label="Period"
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 days' },
              { value: '14', label: '14 days' },
              { value: '30', label: '30 days' },
            ]}
          />
        </div>
        <div className="w-full max-w-[14rem]">
          <Field label="Currency">
            {(p) => (
              <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {(choices.length ? choices : [{ code: 'sparks', name: 'Sparks' }]).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="text-sm text-text-3">Real accounts only, from {formatDay(d.dayList[0]!, { day: 'numeric', month: 'short' })} to today (days in UTC).</p>
      </div>

      <section aria-labelledby="health-totals">
        <h2 id="health-totals" className="sr-only">
          Totals
        </h2>
        <Summary>
          {circulating ? (
            <>
              Players hold {formatNumber(circulating.circulating)} {name} between them.{' '}
            </>
          ) : null}
          Over {periodText} they earned {formatNumber(earned)} and spent {formatNumber(spent)}, so {earned >= spent ? `${formatNumber(earned - spent)} more` : `${formatNumber(spent - earned)} fewer`} {name} are around than before.
        </Summary>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="In circulation now" value={circulating ? formatNumber(circulating.circulating) : '-'} hint={circulating ? plural(circulating.holders, 'player holds some', 'players hold some') : undefined} />
          <Stat label={`Earned, ${d.days} days`} value={formatNumber(earned)} />
          <Stat label={`Spent, ${d.days} days`} value={formatNumber(spent)} />
          <Stat label="Change" value={signed(earned - spent)} hint={earned >= spent ? 'More earned than spent' : 'More spent than earned'} />
        </div>
      </section>

      <Card title="Day by day">
        <Summary>
          {busiest && busiest.earned > 0 ? `The busiest day was ${formatDay(busiest.day, { weekday: 'long', day: 'numeric', month: 'short' })}, with ${formatNumber(busiest.earned)} ${name} earned. ` : `No ${name} were earned in ${periodText}. `}
          {currency === 'sparks'
            ? capDays
              ? `On ${plural(capDays, 'day')} some players reached the daily limit on game Sparks (${formatNumber(d.cap)}); today ${plural(d.cappedToday, 'player has', 'players have')}.`
              : `Nobody reached the daily limit on game Sparks (${formatNumber(d.cap)}) in ${periodText}.`
            : null}
        </Summary>
        <DataTable
          caption={`${name} earned and spent each day`}
          minWidth={560}
          rows={[...rows].reverse()}
          rowKey={(r) => r.day}
          columns={[
            { key: 'day', header: 'Day', cell: (r) => <span className="whitespace-nowrap">{formatDay(r.day, { weekday: 'short', day: 'numeric', month: 'short' })}</span> },
            {
              key: 'earned',
              header: 'Earned',
              align: 'right',
              cell: (r) => (
                <div className="text-right tabular">
                  {formatNumber(r.earned)}
                  <Bar value={r.earned} max={maxDay} tone="in" />
                </div>
              ),
            },
            {
              key: 'spent',
              header: 'Spent',
              align: 'right',
              cell: (r) => (
                <div className="text-right tabular">
                  {formatNumber(r.spent)}
                  <Bar value={r.spent} max={maxDay} tone="out" />
                </div>
              ),
            },
            { key: 'net', header: 'Change', align: 'right', cell: (r) => <span className={`tabular ${r.earned - r.spent >= 0 ? 'text-glim' : 'text-ember'}`}>{signed(r.earned - r.spent)}</span> },
            ...(currency === 'sparks' ? [{ key: 'cap', header: 'Reached the daily limit', align: 'right' as const, cell: (r: (typeof rows)[number]) => (r.earners ? `${formatNumber(r.capped)} of ${formatNumber(r.earners)}` : <span className="text-text-3">-</span>) }] : []),
          ]}
        />
        {currency === 'sparks' ? <p className="mt-2 text-xs text-text-3">"Reached the daily limit" counts players whose game Sparks that day came to today's limit of {formatNumber(d.cap)}, out of everyone who earned game Sparks.</p> : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Where they come from">
          <Summary>{topSource ? `${reasonLabel(topSource.reason)} brought in the most: ${formatNumber(topSource.earned)} of the ${formatNumber(earned)} ${name} earned.` : `Nothing earned in ${periodText}.`}</Summary>
          <ReasonTable rows={sources.map((r) => ({ reason: r.reason, total: r.earned, entries: r.entries }))} tone="in" caption={`Sources of ${name}`} />
        </Card>
        <Card title="Where they go">
          <Summary>{topSink ? `${reasonLabel(topSink.reason)} took the most: ${formatNumber(topSink.spent)} of the ${formatNumber(spent)} ${name} spent.` : `Nothing spent in ${periodText}.`}</Summary>
          <ReasonTable rows={sinks.map((r) => ({ reason: r.reason, total: r.spent, entries: r.entries }))} tone="out" caption={`Where ${name} were spent`} />
        </Card>
      </div>

      <Card title="How Sparks balances are spread">
        <Summary>
          {d.players
            ? `${plural(d.players, 'player account has', 'player accounts have')} a Sparks wallet. The player in the middle holds ${formatNumber(d.medianSparks ?? 0)} Sparks. The most common range is ${biggestBand?.label ?? '-'} (${plural(biggestBand?.players ?? 0, 'player')}). Only counts are shown, never who holds what.`
            : 'No player accounts yet.'}
        </Summary>
        <DataTable
          caption="Players by how many Sparks they hold"
          minWidth={360}
          rows={d.bands}
          rowKey={(b) => b.label}
          columns={[
            { key: 'band', header: 'Sparks held', cell: (b) => b.label },
            {
              key: 'players',
              header: 'Players',
              align: 'right',
              cell: (b) => (
                <div className="text-right tabular">
                  {formatNumber(b.players)}
                  <span className="ml-1 text-xs text-text-3">{d.players ? `(${Math.round((b.players / d.players) * 100)}%)` : ''}</span>
                  <Bar value={b.players} max={maxBand} tone="plain" />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Bought most">
          <Summary>{d.mostBought[0] ? `${d.mostBought[0].name} was bought most: ${plural(d.mostBought[0].bought, 'time')} in ${periodText}. Refunded purchases are left out.` : `Nothing was bought in ${periodText}.`}</Summary>
          <ItemsTable rows={d.mostBought} caption="Most bought shop listings" />
        </Card>
        <Card title="Bought least">
          <Summary>{d.leastBought[0] ? `Of the things always in the shop, ${d.leastBought[0].name} sold least (${plural(d.leastBought[0].bought, 'time')}). Daily and weekly picks are left out because they are only in the shop some days.` : 'No always-on listings.'}</Summary>
          <ItemsTable rows={d.leastBought} caption="Least bought shop listings" />
        </Card>
      </div>

      {overview.data?.lanterns.length ? (
        <Card title="Lantern odds: told and drawn">
          <Summary>Told is what players are shown. Drawn is what real players got in the last 7 days. Small numbers swing a lot, so compare once a Lantern has a few hundred openings.</Summary>
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-m)] border border-line-strong px-3 text-sm font-semibold text-text hover:bg-surface-2">
              Show the odds for {plural(overview.data.lanterns.length, 'Lantern')}
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {overview.data.lanterns.map((l) => (
                <LanternOddsBlock key={l.id} lantern={l} />
              ))}
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

function ReasonTable({ rows, tone, caption }: { rows: { reason: string; total: number; entries: number }[]; tone: 'in' | 'out'; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <DataTable
      caption={caption}
      minWidth={320}
      rows={rows}
      rowKey={(r) => r.reason}
      empty="None."
      columns={[
        { key: 'reason', header: 'What', cell: (r) => reasonLabel(r.reason) },
        { key: 'n', header: 'Times', align: 'right', cell: (r) => <span className="tabular">{formatNumber(r.entries)}</span> },
        {
          key: 'total',
          header: 'Amount',
          align: 'right',
          cell: (r) => (
            <div className="text-right tabular">
              {formatNumber(r.total)}
              <Bar value={r.total} max={max} tone={tone} />
            </div>
          ),
        },
      ]}
    />
  );
}

function ItemsTable({ rows, caption }: { rows: Health['mostBought']; caption: string }) {
  return (
    <DataTable
      caption={caption}
      minWidth={380}
      rows={rows}
      rowKey={(r) => r.id}
      empty="None."
      columns={[
        { key: 'name', header: 'Listing', cell: (r) => <span className="font-semibold">{r.name}</span> },
        { key: 'section', header: 'Shop section', cell: (r) => <span className="text-text-2">{sectionLabel(r.section)}</span> },
        { key: 'n', header: 'Bought', align: 'right', cell: (r) => <span className="tabular">{formatNumber(r.bought)}</span> },
        { key: 'spent', header: 'Spent', align: 'right', cell: (r) => (r.spent ? <Amount currency={r.currency} value={r.spent} size="sm" /> : <span className="text-text-3">0</span>) },
      ]}
    />
  );
}

/* ============================ rules: preview, boost, history ============================ */

interface PreviewData {
  preview: {
    rows: { id: string; who: string; before: { sparks: number; xp: number }; after: { sparks: number; xp: number } }[];
    gamesToCap: { before: number | null; after: number | null };
    headline: string;
    boostNote: string | null;
  };
  changes: { path: string; from: string; to: string }[];
}

function usePreview(rules: EconomyRules | null) {
  const body = useDebounced(rules ? JSON.stringify(rules) : '', 350);
  return useQuery({
    queryKey: ['admin', 'economy', 'rules-preview', body],
    queryFn: () => api.post<PreviewData>('/api/admin/economy/rules/preview', { rules: JSON.parse(body) as EconomyRules }),
    enabled: Boolean(body),
    placeholderData: (p) => p,
    retry: false,
  });
}

/** The preview's one sentence, for the save bar that stays in view while the form is edited. */
export function RulesPreviewHeadline({ rules }: { rules: EconomyRules }) {
  const q = usePreview(rules);
  return q.data ? <span className="block font-semibold text-text">{q.data.preview.headline}</span> : null;
}

/** What a typical game pays under the rules being edited, beside what it pays now. Recomputed by the server as the form changes. */
export function RulesPreviewCard({ rules, compact = false }: { rules: EconomyRules | null; compact?: boolean }) {
  const q = usePreview(rules);
  if (!rules) {
    if (compact) return null;
    return (
      <Card title="What a game would pay">
        <p className="text-sm text-text-2">Change a rule above and this shows what a typical game would pay under the new rules, beside what it pays now, before anything is saved.</p>
      </Card>
    );
  }
  const p = q.data?.preview;
  const content = q.isError ? (
    <p className="text-sm text-text-2">The preview did not load. The server checks the rules again when you save.</p>
  ) : !p ? (
    <Skeleton className="h-32" />
  ) : (
    <>
      <p className="mb-3 font-display text-lg leading-snug font-bold text-text" aria-live="polite">
        {p.headline}
      </p>
      {compact ? null : (
        <DataTable
          caption="Sparks and XP a game pays now and under the new rules"
          minWidth={520}
          rows={p.rows}
          rowKey={(r) => r.id}
          columns={[
            { key: 'who', header: 'A player who', cell: (r) => r.who },
            { key: 'now', header: 'Now', align: 'right', cell: (r) => <span className="tabular text-text-2">{formatNumber(r.before.sparks)} Sparks</span> },
            {
              key: 'new',
              header: 'New rules',
              align: 'right',
              cell: (r) => (
                <span className={`font-semibold tabular ${r.after.sparks > r.before.sparks ? 'text-glim' : r.after.sparks < r.before.sparks ? 'text-ember' : ''}`}>
                  {formatNumber(r.after.sparks)} Sparks
                  {r.after.sparks !== r.before.sparks ? <span className="ml-1 text-xs font-normal">({signed(r.after.sparks - r.before.sparks)})</span> : null}
                </span>
              ),
            },
            { key: 'xp', header: 'XP', align: 'right', cell: (r) => <span className="tabular text-text-2">{r.before.xp === r.after.xp ? formatNumber(r.after.xp) : `${formatNumber(r.before.xp)} to ${formatNumber(r.after.xp)}`}</span> },
          ]}
        />
      )}
      {p.gamesToCap.before !== p.gamesToCap.after ? (
        <p className="mt-2 text-sm text-text-2">
          Games like the first one needed to reach the daily limit: {p.gamesToCap.before ?? 'never'} now, {p.gamesToCap.after ?? 'never'} under the new rules.
        </p>
      ) : null}
      {p.boostNote ? <p className="mt-2 text-sm text-text-3">{p.boostNote}</p> : null}
    </>
  );
  if (compact) return <div className="rounded-[var(--radius-m)] border border-line bg-sunken p-3">{content}</div>;
  return <Card title="What a game would pay">{content}</Card>;
}

export interface BoostDraft {
  on: boolean;
  label: string;
  multiplier: string;
  startsAt: string;
  endsAt: string;
}

export function boostDraftFrom(b: EconomyRules['boost']): BoostDraft {
  return b ? { on: true, label: b.label, multiplier: String(b.multiplier), startsAt: isoToLocalInput(b.startsAt), endsAt: isoToLocalInput(b.endsAt) } : { on: false, label: 'Double Sparks weekend', multiplier: '2', startsAt: '', endsAt: '' };
}

export function buildBoost(d: BoostDraft): { boost: EconomyRules['boost']; errors: Record<string, string> } {
  if (!d.on) return { boost: null, errors: {} };
  const errors: Record<string, string> = {};
  const label = d.label.trim();
  if (label.length < 3 || label.length > 60) errors['boost.label'] = 'Give it a name of 3 to 60 characters, for example "Double Sparks weekend".';
  const m = /^\d+(\.\d+)?$/.test(d.multiplier.trim()) ? Number(d.multiplier) : NaN;
  if (!(m >= 1.1 && m <= 3)) errors['boost.multiplier'] = 'Use a number from 1.1 to 3, for example 2 for double.';
  const startsAt = localInputToIso(d.startsAt);
  const endsAt = localInputToIso(d.endsAt);
  if (!startsAt) errors['boost.startsAt'] = 'Choose when it starts.';
  if (!endsAt) errors['boost.endsAt'] = 'Choose when it ends.';
  if (startsAt && endsAt) {
    const len = new Date(endsAt).getTime() - new Date(startsAt).getTime();
    if (len <= 0) errors['boost.endsAt'] = 'It has to end after it starts.';
    else if (len > 14 * 86_400_000) errors['boost.endsAt'] = 'A boost lasts at most 14 days.';
  }
  return { boost: Object.keys(errors).length ? null : { label, multiplier: m, startsAt: startsAt!, endsAt: endsAt! }, errors };
}

/** A Sparks boost: game Sparks multiplied between two dates, up to the same daily limit. Saved with the rules. */
export function BoostCard({ draft, onChange, errors, readOnly }: { draft: BoostDraft; onChange: (d: BoostDraft) => void; errors: Record<string, string>; readOnly: boolean }) {
  const end = localInputToIso(draft.endsAt);
  return (
    <Card title="Sparks boost">
      <p className="-mt-1 mb-3 max-w-[75ch] text-sm text-text-3">
        An economy event: between two dates, game Sparks are multiplied, for a school holiday or a celebration. The daily limit stays the same, so a boost helps players reach it sooner and never raises it. Players see it calmly, for example "Double Sparks until Sunday", with no countdown.
      </p>
      <Switch checked={draft.on} onCheckedChange={(on) => onChange({ ...draft, on })} label="Run a Sparks boost" description={draft.on ? 'Saved with the rules.' : 'No boost is set.'} disabled={readOnly} />
      {draft.on ? (
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name players see" error={errors['boost.label']} hint="Short and plain.">
            {(p) => <Input {...p} value={draft.label} maxLength={60} onChange={(e) => onChange({ ...draft, label: e.target.value })} disabled={readOnly} />}
          </Field>
          <Field label="Multiply game Sparks by" error={errors['boost.multiplier']} hint="From 1.1 to 3. 2 is double.">
            {(p) => <Input {...p} inputMode="decimal" value={draft.multiplier} onChange={(e) => onChange({ ...draft, multiplier: e.target.value })} disabled={readOnly} />}
          </Field>
          <DateTimeField label="Starts" value={draft.startsAt} onChange={(v) => onChange({ ...draft, startsAt: v })} error={errors['boost.startsAt']} disabled={readOnly} />
          <DateTimeField label="Ends" value={draft.endsAt} onChange={(v) => onChange({ ...draft, endsAt: v })} error={errors['boost.endsAt']} disabled={readOnly} hint="At most 14 days after the start." />
          {end && !errors['boost.endsAt'] ? (
            <p className="text-sm text-text-2 md:col-span-2">
              Players will see: <span className="font-semibold text-text">"{draft.label.trim() || 'Sparks boost'} {calmUntil(end)}"</span>.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

interface RulesChange {
  id: number;
  at: string;
  by: string;
  reason: string | null;
  undoOf: number | null;
  changes: { path: string; from: string; to: string }[];
  canUndo: boolean;
}

/** Plain names for rule paths in the history. */
const RULE_PATH_LABEL: Record<string, string> = {
  welcomeSparks: 'Welcome Sparks',
  starterItems: 'Starter items',
  'game.participationSparks': 'Sparks for taking part',
  'game.sparksPerCorrect': 'Sparks per correct answer',
  'game.placeSparks': 'Podium Sparks',
  'game.minAnswered': 'Answers needed to earn',
  'game.dailySparkCap': 'Daily cap on game Sparks',
  'game.soloMultiplier': 'Solo game multiplier',
  'game.xpParticipation': 'XP for taking part',
  'game.xpPerCorrect': 'XP per correct answer',
  'game.xpWin': 'XP for winning',
  'game.xpHost': 'XP for hosting',
  'levelUp.sparks': 'Sparks per level-up',
  'levelUp.moonstonesEvery': 'Moonstones every this many levels',
  'levelUp.moonstones': 'Moonstones on those levels',
  'dailyStreak.sparksPerDay': 'Streak Sparks per day',
  'dailyStreak.maxBonusDays': 'Streak days that count',
  'dailyStreak.moonstonesOnWeek': 'Moonstones for each full week',
  'classRewards.weeklyBudget': 'Class rewards: weekly budget per class',
  'classRewards.maxPerStudent': 'Class rewards: most for one student',
  boost: 'Sparks boost',
};

export function RulesHistoryCard({ onUndone }: { onUndone: (rules: EconomyRules) => void }) {
  const canConfigure = useCan('economy.configure');
  const q = useQuery({ queryKey: ['admin', 'economy', 'rules-history'], queryFn: () => api.get<{ changes: RulesChange[] }>('/api/admin/economy/rules/history') });
  const [undoing, setUndoing] = useState<RulesChange | null>(null);
  const undo = useStaffMutation((body: { changeId: number; reason: string }) => api.post<{ ok: true; rules: EconomyRules }>('/api/admin/economy/rules/undo', body), {
    silentError: true,
    success: 'Change undone. The earlier rules apply within 10 seconds.',
    invalidate: [['admin', 'economy', 'rules'], ['admin', 'economy', 'rules-history']],
    onSuccess: (res) => onUndone(res.rules),
  });
  const list = q.data?.changes ?? [];
  return (
    <Card title="Rule changes">
      <Summary>{list.length ? `The last ${plural(list.length, 'change')} to the rules, newest first, with who made each and why. The newest can be undone in one step, which puts the rules back as they were just before it.` : 'Nobody has changed the rules yet. Ludora is using its defaults.'}</Summary>
      {q.isError ? <ErrorNotice message="The rule history did not load." onRetry={() => void q.refetch()} /> : null}
      {q.isLoading ? <Skeleton className="h-32" /> : null}
      {list.length ? (
        <ol className="flex flex-col gap-2">
          {list.map((c) => (
            <li key={c.id} className="min-w-0 rounded-[var(--radius-m)] border border-line px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-text">
                    <span className="font-semibold">{c.by}</span> <span className="text-text-3">on {dateTime(c.at)}</span>
                    {c.undoOf ? <Badge className="ml-2">Undid change {c.undoOf}</Badge> : null}
                  </p>
                  {c.reason ? <p className="mt-0.5 text-sm break-words text-text-2">"{c.reason}"</p> : null}
                </div>
                {c.canUndo && canConfigure ? (
                  <Button size="sm" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => setUndoing(c)}>
                    Undo this change
                  </Button>
                ) : null}
              </div>
              {c.changes.length ? (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-sm">
                  {c.changes.map((x) => (
                    <li key={x.path} className="break-words">
                      <span className="text-text-2">{RULE_PATH_LABEL[x.path] ?? x.path}:</span> <span className="text-text-3 line-through">{x.from}</span> <span className="text-text-3">to</span> <span className="font-semibold text-text">{x.to}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-text-3">Saved with no change.</p>
              )}
            </li>
          ))}
        </ol>
      ) : null}
      <ActionDialog
        open={Boolean(undoing)}
        onOpenChange={(v) => !v && setUndoing(null)}
        title="Undo this change"
        description="The rules go back to how they were just before it, for everyone, within about 10 seconds. Nothing already paid changes."
        confirmLabel="Undo the change"
        onSubmit={async ({ reason }) => {
          if (undoing) await undo.mutateAsync({ changeId: undoing.id, reason });
        }}
      >
        {undoing ? (
          <ul className="flex flex-col gap-1 text-sm">
            {undoing.changes.map((x) => (
              <li key={x.path}>
                {RULE_PATH_LABEL[x.path] ?? x.path}: <span className="font-semibold">{x.to}</span> goes back to <span className="font-semibold">{x.from}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </ActionDialog>
    </Card>
  );
}

/* ================================ shop and sales ================================ */

interface AdminListing {
  id: string;
  section: string;
  priceCurrency: string;
  priceAmount: number;
  salePrice: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  featured: boolean;
  active: boolean;
  rotation: string | null;
  title: string | null;
  target: { kind: 'item' | 'pack' | 'bundle'; name: string | null };
  sold: number;
}

type SaleState = 'running' | 'planned' | 'over' | 'none';
function saleState(l: AdminListing, now = Date.now()): SaleState {
  if (l.salePrice === null || !l.saleStartsAt || !l.saleEndsAt) return 'none';
  if (new Date(l.saleEndsAt).getTime() <= now) return 'over';
  if (new Date(l.saleStartsAt).getTime() > now) return 'planned';
  return 'running';
}
const listingName = (l: AdminListing) => l.title ?? l.target.name ?? l.id;

export function SalesTab() {
  const [q, setQ] = useState('');
  const [section, setSection] = useState('');
  const [only, setOnly] = useState<'all' | 'sale' | 'featured'>('all');
  const [shown, setShown] = useState(30);
  const dq = useDebounced(q.trim(), 250);
  const list = useQuery({ queryKey: ['admin', 'shop', 'listings', 'economy'], queryFn: () => api.get<{ listings: AdminListing[] }>('/api/admin/shop/listings?active=1') });
  const [saleFor, setSaleFor] = useState<AdminListing | null>(null);
  const [endFor, setEndFor] = useState<AdminListing | null>(null);
  const [priceFor, setPriceFor] = useState<AdminListing | null>(null);
  const [featureFor, setFeatureFor] = useState<AdminListing | null>(null);
  const all = list.data?.listings ?? [];
  const rows = all.filter((l) => {
    if (section && l.section !== section) return false;
    if (only === 'sale' && saleState(l) !== 'running' && saleState(l) !== 'planned') return false;
    if (only === 'featured' && !l.featured) return false;
    if (dq && !`${listingName(l)} ${l.id}`.toLowerCase().includes(dq.toLowerCase())) return false;
    return true;
  });
  // Sales and featured listings first, so what is going on now is at the top.
  const weight = (l: AdminListing) => (saleState(l) === 'running' ? 0 : saleState(l) === 'planned' ? 1 : l.featured ? 2 : 3);
  rows.sort((a, b) => weight(a) - weight(b));
  const running = all.filter((l) => saleState(l) === 'running').length;
  const planned = all.filter((l) => saleState(l) === 'planned').length;
  const featured = all.filter((l) => l.featured).length;
  const cols: Column<AdminListing>[] = [
    {
      key: 'name',
      header: 'Listing',
      cell: (l) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-text">{listingName(l)}</span>
          <span className="block text-xs text-text-3">
            {sectionLabel(l.section)}
            {l.rotation ? ` (${l.rotation} pick)` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      cell: (l) =>
        saleState(l) === 'running' ? (
          <span className="inline-flex flex-col items-end">
            <Amount currency={l.priceCurrency} value={l.salePrice!} size="sm" />
            <span className="text-xs text-text-3 line-through">{formatNumber(l.priceAmount)}</span>
          </span>
        ) : (
          <Amount currency={l.priceCurrency} value={l.priceAmount} size="sm" />
        ),
    },
    {
      key: 'sale',
      header: 'Sale',
      cell: (l) => {
        const st = saleState(l);
        if (st === 'running') return <span className="text-sm">On sale {calmUntil(l.saleEndsAt!)}</span>;
        if (st === 'planned') return <span className="text-sm text-text-2">Starts {formatDate(l.saleStartsAt!, { weekday: 'short', day: 'numeric', month: 'short' })}</span>;
        if (st === 'over') return <span className="text-sm text-text-3">Ended</span>;
        return <span className="text-text-3">-</span>;
      },
    },
    { key: 'sold', header: 'Sold', align: 'right', cell: (l) => <span className="tabular">{formatNumber(l.sold)}</span> },
    {
      key: 'featured',
      header: 'Featured',
      cell: (l) =>
        l.featured ? (
          <Badge tone="amber" className="inline-flex items-center gap-1">
            <Star className="size-3" aria-hidden /> Featured
          </Badge>
        ) : (
          <span className="text-text-3">-</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (l) => (
        <span className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setSaleFor(l)} aria-label={`${saleState(l) === 'running' || saleState(l) === 'planned' ? 'Change sale' : 'Put on sale'}: ${listingName(l)}`}>
            {saleState(l) === 'running' || saleState(l) === 'planned' ? 'Change sale' : 'Put on sale'}
          </Button>
          {saleState(l) !== 'none' ? (
            <Button size="sm" variant="ghost" onClick={() => setEndFor(l)} aria-label={`End sale: ${listingName(l)}`}>
              End sale
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setPriceFor(l)} aria-label={`Price: ${listingName(l)}`}>
            Price
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFeatureFor(l)} aria-label={`${l.featured ? 'Unfeature' : 'Feature'}: ${listingName(l)}`}>
            {l.featured ? 'Unfeature' : 'Feature'}
          </Button>
        </span>
      ),
    },
  ];
  const sections = [...new Set(all.map((l) => l.section))];
  return (
    <div className="flex flex-col gap-4">
      <Summary>
        {list.data
          ? `${plural(all.length, 'listing is', 'listings are')} in the shop. ${plural(running, 'is', 'are')} on sale now${planned ? `, ${planned} more ${planned === 1 ? 'sale is' : 'sales are'} planned` : ''}, and ${plural(featured, 'is', 'are')} featured. Players see a sale as "on sale until Friday", never a countdown. Every change asks for a reason and goes in the audit log.`
          : 'Loading the shop.'}
      </Summary>
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field label="Find a listing">
            {(p) => (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
                <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" autoComplete="off" />
              </div>
            )}
          </Field>
          <Field label="Section">
            {(p) => (
              <Select {...p} value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">Every section</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Segmented
            label="Show"
            value={only}
            onChange={setOnly}
            options={[
              { value: 'all', label: 'All' },
              { value: 'sale', label: 'Sales' },
              { value: 'featured', label: 'Featured' },
            ]}
          />
        </div>
      </Card>
      <DataTable columns={cols} rows={rows.slice(0, shown)} rowKey={(l) => l.id} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} empty="No listings match." minWidth={820} caption="Shop listings with their prices, sales and featured state" />
      {rows.length > shown ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setShown(shown + 30)}>Show 30 more</Button>
          <span className="text-sm text-text-3">
            Showing {shown} of {formatNumber(rows.length)}. Search or choose a section to narrow it down.
          </span>
        </div>
      ) : null}
      <SaleDialog listing={saleFor} onClose={() => setSaleFor(null)} />
      <EndSaleDialog listing={endFor} onClose={() => setEndFor(null)} />
      <PriceDialog listing={priceFor} onClose={() => setPriceFor(null)} />
      <FeatureDialog listing={featureFor} onClose={() => setFeatureFor(null)} />
    </div>
  );
}

const LISTINGS_KEYS = [['admin', 'shop', 'listings'], ['admin', 'economy']];

function SaleDialog({ listing, onClose }: { listing: AdminListing | null; onClose: () => void }) {
  const [price, setPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  useEffect(() => {
    if (!listing) return;
    const st = saleState(listing);
    const keep = st === 'running' || st === 'planned';
    setPrice(keep ? String(listing.salePrice) : String(Math.max(1, Math.round(listing.priceAmount * 0.75))));
    const now = new Date();
    setStartsAt(keep ? isoToLocalInput(listing.saleStartsAt) : isoToLocalInput(now.toISOString()));
    setEndsAt(keep ? isoToLocalInput(listing.saleEndsAt) : isoToLocalInput(new Date(now.getTime() + 3 * 86_400_000).toISOString()));
  }, [listing]);
  const save = useStaffMutation((v: { id: string; body: Record<string, unknown> }) => api.put(`/api/admin/economy/sales/${encodeURIComponent(v.id)}`, v.body), { silentError: true, success: 'Sale saved.', invalidate: LISTINGS_KEYS });
  if (!listing) return null;
  const n = parseWhole(price, 1, Math.max(1, listing.priceAmount - 1));
  const s = localInputToIso(startsAt);
  const e = localInputToIso(endsAt);
  const winErr = s && e && new Date(e) <= new Date(s) ? 'It has to end after it starts.' : s && e && new Date(e).getTime() - new Date(s).getTime() > 31 * 86_400_000 ? 'A sale lasts at most 31 days.' : e && new Date(e) <= new Date() ? 'Choose an end in the future.' : undefined;
  const off = n ? Math.round((1 - n / listing.priceAmount) * 100) : 0;
  return (
    <ActionDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Sale: ${listingName(listing)}`}
      description={`Usually ${formatNumber(listing.priceAmount)} ${listing.priceCurrency === 'sparks' ? 'Sparks' : listing.priceCurrency}. During the sale players pay the sale price instead.`}
      confirmLabel="Save the sale"
      disabled={!n || !s || !e || Boolean(winErr)}
      onSubmit={async ({ reason }) => {
        await save.mutateAsync({ id: listing.id, body: { salePrice: n, startsAt: s, endsAt: e, reason } });
      }}
    >
      <Field label="Sale price" error={price && !n ? (listing.priceAmount > 1 ? `Use a whole number from 1 to ${formatNumber(listing.priceAmount - 1)}: lower than the usual price.` : 'This listing is too cheap to put on sale.') : undefined} hint={n ? `${off}% off.` : undefined}>
        {(p) => <Input {...p} inputMode="numeric" value={price} onChange={(ev) => setPrice(ev.target.value)} autoComplete="off" />}
      </Field>
      <DateTimeField label="Starts" value={startsAt} onChange={setStartsAt} />
      <DateTimeField label="Ends" value={endsAt} onChange={setEndsAt} error={winErr} hint="At most 31 days after the start." />
      {e && !winErr ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-m)] border border-line bg-sunken px-3 py-2 text-sm text-text-2">
          <Tag className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Players will see <span className="font-semibold text-text">"On sale {calmUntil(e)}"</span> beside the old price crossed out. No countdown.
          </span>
        </p>
      ) : null}
    </ActionDialog>
  );
}

function EndSaleDialog({ listing, onClose }: { listing: AdminListing | null; onClose: () => void }) {
  const end = useStaffMutation((v: { id: string; reason: string }) => api.post(`/api/admin/economy/sales/${encodeURIComponent(v.id)}/end`, { reason: v.reason }), { silentError: true, success: 'Sale ended. The usual price is back.', invalidate: LISTINGS_KEYS });
  if (!listing) return null;
  return (
    <ActionDialog open onOpenChange={(v) => !v && onClose()} title={`End the sale: ${listingName(listing)}`} description={`The price goes back to ${formatNumber(listing.priceAmount)} straight away. Anything already bought keeps the price paid.`} confirmLabel="End the sale" variant="danger" onSubmit={async ({ reason }) => void (await end.mutateAsync({ id: listing.id, reason }))} />
  );
}

function PriceDialog({ listing, onClose }: { listing: AdminListing | null; onClose: () => void }) {
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (listing) setPrice(String(listing.priceAmount));
  }, [listing]);
  const save = useStaffMutation((v: { id: string; body: Record<string, unknown> }) => api.patch(`/api/admin/shop/listings/${encodeURIComponent(v.id)}`, v.body), { silentError: true, success: 'Price saved.', invalidate: LISTINGS_KEYS });
  if (!listing) return null;
  const n = parseWhole(price, 0, 1_000_000);
  return (
    <ActionDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Price: ${listingName(listing)}`}
      description="The new price applies to the next purchase. Nothing already bought changes."
      confirmLabel="Save the price"
      disabled={n === null || n === listing.priceAmount}
      onSubmit={async ({ reason }) => void (await save.mutateAsync({ id: listing.id, body: { priceAmount: n, reason } }))}
    >
      <Field label="Price" error={price && n === null ? wholeError(0, 1_000_000) : undefined} hint={`Now ${formatNumber(listing.priceAmount)}.${listing.salePrice !== null && n !== null && n <= listing.salePrice ? ' This is at or below the sale price, so the sale will stop showing.' : ''}`}>
        {(p) => <Input {...p} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" />}
      </Field>
    </ActionDialog>
  );
}

function FeatureDialog({ listing, onClose }: { listing: AdminListing | null; onClose: () => void }) {
  const save = useStaffMutation((v: { id: string; body: Record<string, unknown> }) => api.patch(`/api/admin/shop/listings/${encodeURIComponent(v.id)}`, v.body), { silentError: true, success: (_r, v) => (v.body.featured ? 'Now featured.' : 'No longer featured.'), invalidate: LISTINGS_KEYS });
  if (!listing) return null;
  const on = !listing.featured;
  return (
    <ActionDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={on ? `Feature ${listingName(listing)}` : `Stop featuring ${listingName(listing)}`}
      description={on ? "It also appears on the shop's Featured tab, as well as in its own section." : "It stays in its own section and leaves the Featured tab."}
      confirmLabel={on ? 'Feature it' : 'Stop featuring'}
      onSubmit={async ({ reason }) => void (await save.mutateAsync({ id: listing.id, body: { featured: on, reason } }))}
    />
  );
}

/* ================================ grants and refunds ================================ */

interface Limits {
  limits: { sparks: number; moonstones: number; dust: number; other: number };
  defaults: { sparks: number; moonstones: number; dust: number; other: number };
  usedToday: Record<string, number>;
  heldToLimit: boolean;
  canChange: boolean;
}

/** The person's own grants today against their daily total, and (administrators only) the place to change it. */
export function GrantLimitsCard() {
  const q = useQuery({ queryKey: ['admin', 'economy', 'limits'], queryFn: () => api.get<Limits>('/api/admin/economy/limits') });
  const [editing, setEditing] = useState(false);
  if (q.isError) return <ErrorNotice message="Your grant limit did not load." onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-48" />;
  const d = q.data;
  const rows: [string, string, number][] = [
    ['sparks', 'Sparks', d.limits.sparks],
    ['moonstones', 'Moonstones', d.limits.moonstones],
    ['dust', 'Glow Dust', d.limits.dust],
  ];
  return (
    <Card title="Daily grant limit" actions={d.canChange ? <Button size="sm" onClick={() => setEditing(true)}>Change the limits</Button> : null}>
      <Summary>
        {d.heldToLimit
          ? 'Economy managers can grant up to these totals each day (UTC), across every player and class. Removals and refunds do not count. Only an administrator can change the limits.'
          : 'You are an administrator, so your own grants have no daily total (each one is still capped). These are the daily totals for economy managers.'}
      </Summary>
      <ul className="flex flex-col gap-3">
        {rows.map(([code, label, limit]) => {
          const used = d.usedToday[code] ?? 0;
          const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
          return (
            <li key={code} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-text">
                  <CurrencyIcon code={code} size={16} />
                  {label}
                </span>
                <span className="text-text-2 tabular">{d.heldToLimit ? `${formatNumber(used)} of ${formatNumber(limit)} granted today` : `${formatNumber(limit)} a day for economy managers`}</span>
              </div>
              {d.heldToLimit ? (
                <div className="mt-1 h-2.5 rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)]" role="progressbar" aria-label={`${label} granted today`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
                  <div className="h-full rounded-[var(--radius-s)] bg-lantern" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-text-3">Any other currency: {formatNumber(d.limits.other)} a day. Each single grant to a player is also capped, for example {formatNumber(realGrantCap('sparks'))} Sparks.</p>
      {editing ? <LimitsDialog current={d.limits} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function LimitsDialog({ current, onClose }: { current: Limits['limits']; onClose: () => void }) {
  const [v, setV] = useState({ sparks: String(current.sparks), moonstones: String(current.moonstones), dust: String(current.dust), other: String(current.other) });
  const save = useStaffMutation((body: { limits: Limits['limits']; reason: string }) => api.put('/api/admin/economy/limits', body), { silentError: true, success: 'Daily grant limits saved.', invalidate: [['admin', 'economy', 'limits']] });
  const parsed = { sparks: parseWhole(v.sparks, 0, 1_000_000), moonstones: parseWhole(v.moonstones, 0, 100_000), dust: parseWhole(v.dust, 0, 1_000_000), other: parseWhole(v.other, 0, 1_000_000) };
  const ok = Object.values(parsed).every((x) => x !== null);
  const field = (k: keyof typeof v, label: string, max: number) => (
    <Field key={k} label={label} error={v[k] && parsed[k] === null ? wholeError(0, max) : undefined}>
      {(p) => <Input {...p} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} autoComplete="off" />}
    </Field>
  );
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Daily grant limits for economy managers" description="The most each economy manager can grant in one day (UTC), per currency. Applies from their next grant." confirmLabel="Save the limits" disabled={!ok} onSubmit={async ({ reason }) => void (await save.mutateAsync({ limits: parsed as Limits['limits'], reason }))}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field('sparks', 'Sparks a day', 1_000_000)}
        {field('moonstones', 'Moonstones a day', 100_000)}
        {field('dust', 'Glow Dust a day', 1_000_000)}
        {field('other', 'Any other currency a day', 1_000_000)}
      </div>
    </ActionDialog>
  );
}

interface PurchaseRow {
  id: number;
  listingId: string;
  name: string;
  price: { currency: string; amount: number };
  at: string;
  refundedAt: string | null;
  refundable: string | null;
}

/** The chosen account's purchases, with a refund for each one that can be refunded. */
export function RefundsCard({ userId, name, confirmWord }: { userId: string; name: string; confirmWord: string | null }) {
  const q = useQuery({ queryKey: ['admin', 'economy', 'purchases', userId], queryFn: () => api.get<{ purchases: PurchaseRow[] }>(`/api/admin/economy/purchases?userId=${userId}`) });
  const [refunding, setRefunding] = useState<PurchaseRow | null>(null);
  const keyRef = useRef<{ id: number; key: string } | null>(null);
  const refund = useStaffMutation((body: Record<string, unknown>) => api.post<{ refunded: number; currency: string; balance: number }>('/api/admin/economy/refund', body), {
    silentError: true,
    success: (r) => `Refunded ${formatNumber(r.refunded)}. ${name} now has ${formatNumber(r.balance)}.`,
    invalidate: [['admin', 'economy'], ['admin', 'wallet']],
    onSuccess: () => {
      keyRef.current = null;
    },
  });
  const rows = q.data?.purchases ?? [];
  return (
    <Card title={`Refunds for ${name}`}>
      <Summary>A refund gives back what was paid and takes the item back. Lanterns cannot be refunded because the Glim has already been drawn; grant instead if something went wrong.</Summary>
      <DataTable
        caption={`${name}'s purchases, newest first`}
        minWidth={560}
        rows={rows}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty="They have not bought anything yet."
        columns={[
          { key: 'at', header: 'When', cell: (r) => <TimeCell iso={r.at} /> },
          { key: 'name', header: 'What', cell: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'price', header: 'Paid', align: 'right', cell: (r) => <Amount currency={r.price.currency} value={r.price.amount} size="sm" /> },
          {
            key: 'refund',
            header: <span className="sr-only">Refund</span>,
            cell: (r) =>
              r.refundedAt ? (
                <Badge tone="mint">Refunded {formatDate(r.refundedAt, { day: 'numeric', month: 'short' })}</Badge>
              ) : r.refundable ? (
                <span className="text-xs text-text-3">{r.refundable}</span>
              ) : (
                <Button size="sm" onClick={() => setRefunding(r)} aria-label={`Refund ${r.name}`}>
                  Refund
                </Button>
              ),
          },
        ]}
      />
      <ActionDialog
        open={Boolean(refunding)}
        onOpenChange={(v) => !v && setRefunding(null)}
        title={refunding ? `Refund ${refunding.name}` : 'Refund'}
        description={refunding ? `${name} gets back ${formatNumber(refunding.price.amount)} and loses the item. Written to the ledger and the audit log.` : undefined}
        confirmWord={confirmWord}
        confirmLabel="Refund"
        onSubmit={async ({ reason, confirm }) => {
          if (!refunding) return;
          if (!keyRef.current || keyRef.current.id !== refunding.id) keyRef.current = { id: refunding.id, key: newRequestKey('refund') };
          await refund.mutateAsync({ purchaseId: refunding.id, reason, requestKey: keyRef.current.key, ...(confirm !== undefined ? { confirm } : {}) });
        }}
      />
    </Card>
  );
}

interface ClassHit {
  id: string;
  name: string;
  archived: boolean;
  teacher: string;
  students: number;
}

/** One grant to every student in a class, for when a whole class lost out (a server problem during a lesson, say). */
export function ClassGrantCard() {
  const { choices } = useCurrencyChoices();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [picked, setPicked] = useState<ClassHit | null>(null);
  const [currency, setCurrency] = useState('sparks');
  const [amount, setAmount] = useState('');
  const [open, setOpen] = useState(false);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const res = useQuery({ queryKey: ['admin', 'economy', 'classes', dq], queryFn: ({ signal }) => api.get<{ classes: ClassHit[] }>(`/api/admin/economy/classes?q=${encodeURIComponent(dq)}`, signal), enabled: dq.length >= 2 });
  const cap = realGrantCap(currency);
  const n = parseWhole(amount, 1, cap);
  const grant = useStaffMutation((body: Record<string, unknown>) => api.post<{ students: number; total: number; replayed: boolean }>('/api/admin/economy/grant-class', body), {
    silentError: true,
    success: (r) => (r.replayed ? 'That exact grant was already made, so nothing was done twice.' : `Granted ${formatNumber(r.total)} ${currencyName(choices, currency)} across ${plural(r.students, 'student')}.`),
    invalidate: [['admin', 'economy']],
    onSuccess: () => {
      keyRef.current = null;
      setAmount('');
    },
  });
  return (
    <Card title="Grant to a whole class">
      <Summary>The same amount to every student in a class, with one reason. It counts towards your daily limit as the total.</Summary>
      <div className="flex flex-col gap-3">
        <Field label="Find a class" hint="Class name or join code. At least 2 characters.">
          {(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />}
        </Field>
        {dq.length >= 2 ? (
          res.isLoading ? (
            <Skeleton className="h-16" />
          ) : res.data?.classes.length ? (
            <ul className="flex flex-col gap-1 rounded-[var(--radius-m)] border border-line p-1" aria-label="Matching classes">
              {res.data.classes.map((c) => (
                <li key={c.id}>
                  <button type="button" aria-pressed={picked?.id === c.id} onClick={() => setPicked(c)} className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] px-2.5 py-2 text-left hover:bg-surface-2 aria-pressed:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text">{c.name}</span>
                      <span className="block truncate text-xs text-text-3">
                        {c.teacher}, {plural(c.students, 'student')}
                        {c.archived ? ', archived' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-3">No classes match "{dq}".</p>
          )
        ) : null}
        {picked ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Currency">
              {(p) => (
                <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {choices.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Each student gets" error={amount && n === null ? wholeError(1, cap) : undefined} hint={n ? `${formatNumber(n * picked.students)} in total for ${plural(picked.students, 'student')}.` : `Up to ${formatNumber(cap)} each.`}>
              {(p) => <Input {...p} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />}
            </Field>
            <div className="sm:col-span-2">
              <Button variant="primary" disabled={!n || !picked.students} onClick={() => setOpen(true)}>
                Grant to {picked.name}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {picked && n ? (
        <ActionDialog
          open={open}
          onOpenChange={setOpen}
          title={`Grant to every student in ${picked.name}`}
          description={`${plural(picked.students, 'student')} each get ${formatNumber(n)} ${currencyName(choices, currency)}: ${formatNumber(n * picked.students)} in all. Type the class name to confirm.`}
          confirmWord={picked.name}
          confirmLabel={`Grant ${formatNumber(n * picked.students)} in all`}
          onSubmit={async ({ reason, confirm }) => {
            const sig = JSON.stringify([picked.id, currency, n]);
            if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newRequestKey('class') };
            await grant.mutateAsync({ classId: picked.id, currency, amountEach: n, reason, requestKey: keyRef.current.key, confirm });
          }}
        />
      ) : null}
    </Card>
  );
}

/* ================================= ledger CSV ================================= */

/** Downloads the ledger with the same filters as the table (up to 5,000 rows). The download itself is recorded. */
export function LedgerCsvLink({ userId, currency, reason }: { userId: string; currency: string; reason: string }) {
  const qs = new URLSearchParams();
  if (userId) qs.set('userId', userId);
  if (currency) qs.set('currency', currency);
  if (reason) qs.set('reason', reason);
  return (
    <a href={`/api/admin/economy/ledger.csv${qs.size ? `?${qs}` : ''}`} download className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-m)] border border-line-strong px-3 text-sm font-semibold text-text hover:bg-surface-2">
      <Download className="size-4" aria-hidden />
      Download as CSV{userId ? ' (this account)' : ''}
    </a>
  );
}

/* ================================== history ================================== */

interface ActivityEntry {
  id: number;
  action: string;
  actorName: string;
  targetType: string | null;
  targetName: string | null;
  reason: string | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  'economy.grant': 'Granted',
  'economy.revoke': 'Removed',
  'economy.class_grant': 'Granted to a class',
  'economy.refund': 'Refunded',
  'economy.rules': 'Changed the rules',
  'economy.limits': 'Changed grant limits',
  'economy.export': 'Downloaded the ledger',
  'listing.create': 'Added a listing',
  'listing.update': 'Changed a listing',
  'listing.sale': 'Set a sale',
  'listing.sale_end': 'Ended a sale',
  'currency.create': 'Added a currency',
  'currency.update': 'Changed a currency',
  'event.update': 'Changed an event',
};

function activityDetail(e: ActivityEntry): string {
  const a = e.after ?? {};
  const n = (k: string) => (typeof a[k] === 'number' ? formatNumber(a[k] as number) : null);
  if (e.action === 'economy.grant' || e.action === 'economy.revoke') return a.currency ? `${n('amount')} ${String(a.currency)}` : a.itemName ? String(a.itemName) : '';
  if (e.action === 'economy.class_grant') return `${n('amountEach')} ${String(a.currency)} each to ${n('students')} students`;
  if (e.action === 'economy.refund') return `${n('refunded')} ${String(a.currency)}`;
  if (e.action === 'listing.sale') return a.salePrice !== undefined ? `Sale price ${n('salePrice')}` : '';
  return '';
}

export function ActivityTab() {
  const q = useInfiniteQuery({
    queryKey: ['admin', 'economy', 'activity'],
    queryFn: ({ pageParam, signal }) => api.get<{ entries: ActivityEntry[]; nextBefore: number | null }>(`/api/admin/economy/activity${pageParam ? `?before=${pageParam}` : ''}`, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.entries), [q.data]);
  return (
    <div className="flex flex-col gap-4">
      <Summary>Every change to the economy by staff, newest first: grants, refunds, rules, limits, prices, sales, currencies and events, with who made it and why. This is the economy's part of the audit log.</Summary>
      <DataTable
        caption="Economy changes by staff, newest first"
        minWidth={720}
        rows={rows}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty="No economy changes yet."
        columns={[
          { key: 'when', header: 'When', cell: (r) => <TimeCell iso={r.createdAt} /> },
          { key: 'who', header: 'Who', cell: (r) => <span className="font-semibold whitespace-nowrap">{r.actorName}</span> },
          {
            key: 'what',
            header: 'What',
            cell: (r) => (
              <span className="block">
                {ACTION_LABEL[r.action] ?? r.action}
                {r.targetName ? <span className="text-text-2"> {r.targetType === 'user' ? 'for' : ':'} {r.targetName}</span> : null}
                {activityDetail(r) ? <span className="block text-xs text-text-3">{activityDetail(r)}</span> : null}
              </span>
            ),
          },
          { key: 'why', header: 'Why', className: 'min-w-[160px] max-w-[320px]', cell: (r) => (r.reason ? <span className="break-words text-text-2">{r.reason}</span> : <span className="text-text-3">-</span>) },
        ]}
      />
      <OlderButton next={q.hasNextPage ? (q.data?.pages.at(-1)?.nextBefore ?? null) : null} onLoad={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} />
    </div>
  );
}
