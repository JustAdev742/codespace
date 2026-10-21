import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Check, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { CommonField, SettingField } from '@ludora/shared';
import { SUBJECT_LABELS } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes, useSets, thumbFor, type CatalogEntry, type CatalogVariant, type SetSummary } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, EmptyState, Field, Input, PageHeader, Panel, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { SetCover } from '../sets/SetCover.tsx';

function SetPicker({ value, onChange }: { value: SetSummary | null; onChange: (s: SetSummary) => void }) {
  const me = useMe();
  const [scope, setScope] = useState<'featured' | 'mine' | 'public'>('featured');
  const [q, setQ] = useState('');
  const sets = useSets({ scope, q: q || undefined });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['featured', 'public', ...(me.data?.user ? ['mine'] : [])] as const).map((s) => (
          <button key={s} type="button" onClick={() => setScope(s as typeof scope)} className={`h-9 rounded-full px-4 text-sm font-semibold ${scope === s ? 'bg-text text-bg' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
            {s === 'featured' ? 'Recommended' : s === 'public' ? 'Community' : 'My sets'}
          </button>
        ))}
        <label className="relative ml-auto min-w-[12rem] flex-1 sm:flex-none">
          <span className="sr-only">Search sets</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sets" className="h-9 pl-9" />
        </label>
      </div>
      {sets.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : sets.data?.sets.length === 0 ? (
        <EmptyState title={scope === 'mine' ? 'You have no sets yet' : 'No sets found'} action={scope === 'mine' ? <ButtonLink to="/sets/new" variant="primary">Make a set</ButtonLink> : undefined}>
          {scope === 'mine' ? 'Write your own questions, or copy one from the library.' : 'Try another search.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 max-h-[340px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {(sets.data?.sets ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s)}
              aria-pressed={value?.id === s.id}
              className={`flex items-center gap-3 rounded-[14px] border-2 p-2.5 text-left transition-colors ${value?.id === s.id ? 'border-lantern bg-dusk/20' : 'border-line bg-raised hover:border-line-strong'}`}
            >
              <SetCover cover={s.cover} subject={s.subject} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.title}</span>
                <span className="block truncate text-xs text-text-3">
                  {s.questionCount} questions, {SUBJECT_LABELS[s.subject as keyof typeof SUBJECT_LABELS] ?? s.subject}
                </span>
              </span>
              {value?.id === s.id ? <Check className="size-5 text-lantern" /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Choice = { mode: CatalogEntry; variant: CatalogVariant | null };

function ModePicker({ value, onChange, solo }: { value: Choice | null; onChange: (c: Choice) => void; solo: boolean }) {
  const modes = useModes();
  const list = (modes.data?.modes ?? []).filter((m) => m.meta.status !== 'planned' && (solo ? m.meta.pacing !== 'host' && m.meta.players.min <= 1 : m.meta.pacing !== 'solo'));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.flatMap((m) => [null, ...m.variants].map((v) => ({ mode: m, variant: v }))).map(({ mode, variant }) => {
        const id = variant?.meta.id ?? mode.meta.id;
        const selected = (value?.variant?.meta.id ?? value?.mode.meta.id) === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ mode, variant })}
            aria-pressed={selected}
            className={`flex overflow-hidden rounded-[14px] border-2 text-left transition-colors ${selected ? 'border-lantern' : 'border-line hover:border-line-strong'}`}
          >
            <ModeArt thumb={thumbFor(mode.meta, variant?.meta)} className="w-24 shrink-0 self-stretch" />
            <span className="min-w-0 flex-1 bg-raised p-3">
              <span className="flex items-center gap-2 font-display font-bold">
                {variant?.meta.title ?? mode.meta.title}
                {(variant?.meta.status ?? mode.meta.status) === 'beta' ? <Badge tone="amber">Beta</Badge> : null}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm text-text-2">{variant?.meta.tagline ?? mode.meta.tagline}</span>
              {variant ? <span className="mt-1 block text-xs text-text-3">A twist on {mode.meta.title}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const COMMON_FALLBACK: Record<CommonField, number> = { questionTimeSec: 20, timeLimitSec: 300, questionLimit: 0 };
const TIME_LIMITS = [60, 120, 180, 240, 300, 360, 480, 600, 900, 1200, 1800, 2700, 3600];

function minutes(sec: number): string {
  if (sec < 60) return `${sec} seconds`;
  const m = sec / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** One of the shared settings, shown only for modes that read it and starting from that mode's default. */
function CommonInput({ field, meta, value, locked, onChange }: { field: CommonField; meta: CatalogEntry['meta']; value: number; locked: boolean; onChange: (v: number) => void }) {
  const fixed = locked ? 'Fixed by this variant.' : undefined;
  const help = fixed ?? meta.common.help?.[field];
  if (field === 'timeLimitSec') {
    const allowNone = meta.common.defaults.timeLimitSec === 0;
    const options = [...new Set([...(allowNone ? [0] : []), ...TIME_LIMITS, value])].sort((a, b) => a - b);
    return (
      <Field label="Time limit" hint={help ?? 'The game ends when time runs out, if it has not ended already.'}>
        {(p) => (
          <Select {...p} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} disabled={locked}>
            {options.map((o) => (
              <option key={o} value={o}>
                {o === 0 ? 'No time limit' : minutes(o)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    );
  }
  if (field === 'questionLimit') {
    return (
      <Field label="How many questions" hint={help ?? '0 plays every question in the set.'}>
        {(p) => <Input {...p} type="number" min={0} max={250} value={String(value)} disabled={locked} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="w-28" />}
      </Field>
    );
  }
  return (
    <Field label="Seconds per question" hint={help ?? 'Questions with their own time limit keep it.'}>
      {(p) => <Input {...p} type="number" min={5} max={120} value={String(value)} disabled={locked} onChange={(e) => onChange(Number(e.target.value))} className="w-28" />}
    </Field>
  );
}

function SettingInput({ field, value, onChange, locked }: { field: SettingField; value: unknown; onChange: (v: unknown) => void; locked: boolean }) {
  if (field.kind === 'toggle') return <Switch checked={Boolean(value)} onCheckedChange={onChange} label={field.label} description={locked ? 'Fixed by this variant.' : field.help} disabled={locked} />;
  return (
    <Field label={field.label} hint={locked ? 'Fixed by this variant.' : field.help}>
      {(p) =>
        field.kind === 'number' ? (
          <div className="flex items-center gap-2">
            <Input {...p} type="number" min={field.min} max={field.max} step={field.step ?? 1} value={String(value ?? field.default)} onChange={(e) => onChange(Number(e.target.value))} disabled={locked} className="w-28" />
            {field.unit ? <span className="text-sm text-text-2">{field.unit}</span> : null}
          </div>
        ) : (
          <Select {...p} value={String(value ?? field.default)} onChange={(e) => onChange(e.target.value)} disabled={locked}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )
      }
    </Field>
  );
}

export default function HostSetup() {
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const solo = params.get('solo') === '1';
  const [set, setSet] = useState<SetSummary | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [common, setCommon] = useState<Record<string, number | boolean>>({});
  const [options, setOptions] = useState({ lateJoin: true, generatedNames: false, requireAccount: false });
  const [busy, setBusy] = useState(false);
  const locked = useMemo(() => new Set(choice?.variant?.locked ?? []), [choice]);
  const effective = (k: string, fallback: unknown) => (k in settings ? settings[k] : (choice?.variant?.settings?.[k] ?? fallback));
  // Host choice, then the variant's preset, then the mode's own default.
  const commonValue = (k: CommonField): number => Number(common[k] ?? choice?.variant?.common?.[k] ?? choice?.mode.meta.common.defaults[k] ?? COMMON_FALLBACK[k]);

  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title={solo ? 'Play solo' : 'Host a game'} />
        <EmptyState title="Sign in to host" action={<ButtonLink to="/signin?next=/host" variant="primary">Sign in</ButtonLink>}>
          Hosting needs an account (a guest account is fine). Players joining your game do not need one.
        </EmptyState>
      </>
    );
  }

  const create = async () => {
    if (!set || !choice) return;
    setBusy(true);
    try {
      const res = await api.post<{ code: string }>('/api/rooms', {
        setId: set.id,
        modeId: choice.mode.meta.id,
        variantId: choice.variant?.meta.id ?? null,
        settings,
        common,
        options,
        solo,
      });
      navigate(`/room/${res.code}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the game.');
    } finally {
      setBusy(false);
    }
  };

  const meta = choice?.mode.meta;
  return (
    <>
      <PageHeader title={solo ? 'Play solo' : 'Host a game'} description={solo ? 'Practise any self-paced mode on your own. Solo games earn a little less, so playing together stays the best way to earn.' : 'Pick what to play, then share the code with your players.'} />
      <div className="flex flex-col gap-6">
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-xl font-bold">1. Questions</h2>
          <SetPicker value={set} onChange={setSet} />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-xl font-bold">2. Game mode</h2>
          <ModePicker
            value={choice}
            solo={solo}
            onChange={(c) => {
              setChoice(c);
              setSettings({});
              setCommon({});
            }}
          />
        </Panel>
        {meta && choice ? (
          <Panel className="p-5">
            <h2 className="mb-1 font-display text-xl font-bold">3. Settings</h2>
            <p className="mb-4 text-sm text-text-2">{choice.variant ? choice.variant.meta.changes : meta.description}</p>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {meta.common.fields.map((k) => (
                <CommonInput key={k} field={k} meta={meta} value={commonValue(k)} locked={locked.has(k)} onChange={(v) => setCommon((c) => ({ ...c, [k]: v }))} />
              ))}
              {meta.teams !== 'none' && !solo ? (
                <Field label="Teams" hint={meta.teams === 'required' ? 'This mode is always played in teams.' : undefined}>
                  {(p) => (
                    <Select {...p} value={String(common.teamCount ?? choice.variant?.common?.teamCount ?? (meta.teams === 'required' ? 2 : 0))} onChange={(e) => setCommon((c) => ({ ...c, teamCount: Number(e.target.value) }))}>
                      {meta.teams === 'optional' ? <option value="0">No teams</option> : null}
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n} teams
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              {choice.mode.settings.map((f) => (
                <SettingInput key={f.key} field={f} value={effective(f.key, f.default)} onChange={(v) => setSettings((s) => ({ ...s, [f.key]: v }))} locked={locked.has(f.key)} />
              ))}
            </div>
            {!solo ? (
              <div className="mt-6 border-t border-line pt-4">
                <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
                  <Users className="size-5 text-text-3" /> Room
                </h3>
                <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                  <Switch checked={options.generatedNames} onCheckedChange={(v) => setOptions((o) => ({ ...o, generatedNames: v }))} label="Generated names only" description="Everyone gets a random friendly name. Good for younger classes." />
                  <Switch checked={options.lateJoin} onCheckedChange={(v) => setOptions((o) => ({ ...o, lateJoin: v }))} label="Allow late joining" description="Players can join after the game has started." />
                  <Switch checked={options.requireAccount} onCheckedChange={(v) => setOptions((o) => ({ ...o, requireAccount: v }))} label="Accounts only" description="Only signed-in players with an account can join." />
                </div>
              </div>
            ) : null}
          </Panel>
        ) : null}
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-raised/95 p-4 backdrop-blur lg:bottom-4">
          <p className="text-sm text-text-2">
            {!set ? 'Choose a question set.' : !choice ? 'Choose a game mode.' : `${choice.variant?.meta.title ?? choice.mode.meta.title} with “${set.title}”.`}
          </p>
          <Button variant="primary" size="lg" disabled={!set || !choice} loading={busy} onClick={create}>
            {solo ? 'Start playing' : 'Create game'}
          </Button>
        </div>
        <p className="text-center text-sm text-text-3">
          Want your own questions? <Link to="/sets/new">Make a set</Link>.
        </p>
      </div>
    </>
  );
}
