import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Check, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { CommonField, SettingField } from '@ludora/shared';
import { MODE_CATEGORIES, MODE_CATEGORY_INFO, SUBJECT_LABELS, type ModeCategory } from '@ludora/shared';
import { soloBlocker } from '@ludora/engine/catalog';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes, thumbFor, type CatalogEntry, type CatalogVariant, type SetSummary } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { AccountError, Badge, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { SetCover } from '../sets/SetCover.tsx';
import { OpenGames, openGamesKey, useOpenGames, type OpenGame } from './OpenGames.tsx';
import { plural } from '../../lib/format.ts';

/*
 * Setting up a game: a question set, a mode (then one of its variants), the
 * settings, and Create. Once a set is chosen its picker folds into one line.
 * Modes are sorted and filtered by kind as on the game modes page, and only
 * the chosen mode's variants are shown, under its row, so the page stays short.
 * Hosts who left games open see them at the top, to rejoin or close.
 */

const subjectLabel = (s: string) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* --------------------------------- question set --------------------------------- */

type Scope = 'mine' | 'featured' | 'public';
const SCOPE_LABEL: Record<Scope, string> = { mine: 'My sets', featured: 'Recommended', public: 'Community' };
/** Sets shown at first, and how many more each Show more adds. */
const FIRST_SETS = 6;
const MORE_SETS = 9;

type SetList = { sets: SetSummary[]; total: number };
/** The first list and the My sets check are the same request; this keeps them from fetching twice. */
const SETS_FRESH_MS = 30_000;

function fetchSets(scope: Scope, q: string, signal?: AbortSignal) {
  const search = new URLSearchParams({ scope, pageSize: '48', ...(q ? { q } : {}) });
  return api.get<SetList>(`/api/sets?${search}`, signal);
}

function SetPicker({ onPick, focusOnMount }: { onPick: (s: SetSummary) => void; focusOnMount: boolean }) {
  const me = useMe();
  const hasAccount = Boolean(me.data?.user && !me.data.user.isGuest);
  // Start on the host's own sets when they have some.
  const mine = useQuery({ queryKey: ['sets', { scope: 'mine', q: '', host: true }], queryFn: ({ signal }) => fetchSets('mine', '', signal), enabled: hasAccount, staleTime: SETS_FRESH_MS });
  const [chosenScope, setScope] = useState<Scope | null>(null);
  // Wait to know whether they have sets, so the list does not swap under them once it does.
  const deciding = chosenScope === null && (me.isLoading || (hasAccount && mine.isPending));
  const scope: Scope = chosenScope ?? (hasAccount && (mine.data?.total ?? 0) > 0 ? 'mine' : 'featured');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const sets = useQuery({ queryKey: ['sets', { scope, q, host: true }], queryFn: ({ signal }) => fetchSets(scope, q, signal), placeholderData: (prev) => prev, enabled: !deciding, staleTime: SETS_FRESH_MS });
  const [shown, setShown] = useState(FIRST_SETS);
  const [focusFrom, setFocusFrom] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const all = sets.data?.sets ?? [];
  const visible = all.slice(0, shown);

  useEffect(() => setShown(FIRST_SETS), [scope, q]);
  useEffect(() => {
    // Coming back from Change: start on the set filters, which do not open a phone keyboard.
    if (focusOnMount) chips.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  }, [focusOnMount]);
  useEffect(() => {
    // After Show more, carry on from the first set it revealed.
    if (focusFrom === null) return;
    list.current?.querySelectorAll<HTMLElement>('button')[focusFrom]?.focus();
    setFocusFrom(null);
  }, [focusFrom]);

  const scopes: Scope[] = hasAccount ? ['mine', 'featured', 'public'] : ['featured', 'public'];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div ref={chips}>
          <ToggleChips<Scope> value={scope} onChange={setScope} label="Which sets to show" options={scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} />
        </div>
        <label className="relative min-w-[12rem] flex-1 sm:ml-auto sm:max-w-xs">
          <span className="sr-only">Search sets</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search sets" className="h-10 pl-9" />
        </label>
      </div>
      {sets.isError && !sets.data ? (
        <ErrorNotice message="Question sets could not be loaded." onRetry={() => void sets.refetch()} />
      ) : sets.isPending ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : all.length === 0 ? (
        q ? (
          <EmptyState title="No sets match">Try another word, or look in {scope === 'featured' ? 'Community' : 'Recommended'}.</EmptyState>
        ) : (
          <EmptyState title={scope === 'mine' ? 'You have no sets yet' : 'No sets here yet'} action={scope === 'mine' ? <ButtonLink to="/sets/new" variant="primary">Make a set</ButtonLink> : undefined}>
            {scope === 'mine' ? 'Write your own questions, or pick a recommended set.' : 'Try the recommended sets.'}
          </EmptyState>
        )
      ) : (
        <>
          <ul ref={list} className={`grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 ${sets.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={sets.isPlaceholderData || undefined}>
            {visible.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPick(s)} className="flex h-full w-full items-center gap-3 rounded-[14px] border-2 border-line bg-raised p-2.5 text-left transition-colors hover:border-line-strong">
                  <SetCover cover={s.cover} subject={s.subject} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words">{s.title}</span>
                    <span className="block text-xs text-text-3">
                      {plural(s.questionCount, 'question')}, {subjectLabel(s.subject)}
                      {scope === 'public' && s.ownerName ? `, by ${s.ownerName}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {all.length > shown ? (
              <Button
                size="sm"
                onClick={() => {
                  setFocusFrom(shown);
                  setShown((n) => n + MORE_SETS);
                }}
              >
                Show more sets
              </Button>
            ) : null}
            <p className="text-sm text-text-3">
              {visible.length < (sets.data?.total ?? 0) ? `Showing ${visible.length} of ${sets.data?.total}.` : `${visible.length} ${visible.length === 1 ? 'set' : 'sets'}.`}
              {all.length < (sets.data?.total ?? 0) && visible.length === all.length ? ' Search to find the rest.' : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** The chosen set, folded into one line with a way to change it. */
function ChosenSet({ set, onChange, focusOnMount }: { set: SetSummary; onChange: () => void; focusOnMount: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The set button that had focus has gone; keep keyboard users in the same place.
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <div className="flex items-center gap-3 rounded-[14px] border-2 border-lantern bg-dusk/15 p-3">
      <SetCover cover={set.cover} subject={set.subject} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg leading-tight font-bold break-words">{set.title}</span>
        <span className="block text-sm text-text-2">
          {plural(set.questionCount, 'question')}, {subjectLabel(set.subject)}
        </span>
      </span>
      <Button ref={ref} size="sm" onClick={onChange} aria-label={`Change the question set, ${set.title}`}>
        Change
      </Button>
    </div>
  );
}

/* ----------------------------------- game mode ----------------------------------- */

type Choice = { mode: CatalogEntry; variant: CatalogVariant | null };

/**
 * The modes this page offers, each with only the variants it offers. Hosting
 * leaves out solo modes; playing solo keeps self-paced modes that one player
 * can play with no host and no teams (the server's own check).
 */
function offered(modes: CatalogEntry[], solo: boolean): CatalogEntry[] {
  return modes
    .filter((m) => m.meta.status !== 'planned' && (solo ? m.meta.pacing !== 'host' && !soloBlocker(m.meta.id, null) : m.meta.pacing !== 'solo'))
    .map((m) => ({ ...m, variants: m.variants.filter((v) => v.meta.status !== 'planned' && (!solo || !soloBlocker(m.meta.id, v.meta.id))) }));
}

/** A card holding a radio button. The radio covers the card, so focus scrolling and clicks take the whole card. */
function RadioCard({ name, checked, onSelect, children, className = '' }: { name: string; checked: boolean; onSelect: () => void; children: ReactNode; className?: string }) {
  return (
    <label
      className={`relative flex cursor-pointer overflow-hidden rounded-[14px] border-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${checked ? 'border-lantern bg-dusk/20' : 'border-line bg-raised hover:border-line-strong'} ${className}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0" />
      {children}
      {checked ? (
        <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full border-2 border-ink bg-lantern text-on-accent" aria-hidden>
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </label>
  );
}

/** Variants shown before Show all: the standard rules and the first few twists. Shorter lists show in full. */
const FIRST_VARIANTS = 5;
const FOLD_FROM = 10;

function VariantPicker({ choice, onChange }: { choice: Choice; onChange: (c: Choice) => void }) {
  const { mode } = choice;
  const [all, setAll] = useState(false);
  const [focusFrom, setFocusFrom] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // After Show all, carry on from the first variant it revealed.
    if (focusFrom === null) return;
    list.current?.querySelectorAll<HTMLElement>('input')[focusFrom]?.focus();
    setFocusFrom(null);
  }, [focusFrom]);
  const options: (CatalogVariant | null)[] = [null, ...mode.variants];
  // A variant chosen from the full list stays in view if the list folds again.
  const chosenAt = options.findIndex((v) => (v?.meta.id ?? null) === (choice.variant?.meta.id ?? null));
  const shown = all || options.length < FOLD_FROM ? options : options.slice(0, Math.max(FIRST_VARIANTS + 1, chosenAt + 1));
  return (
    <div className="rounded-[16px] border-2 border-dashed border-lantern-deep bg-surface-2 p-3 sm:p-4">
      <fieldset className="min-w-0">
        <legend className="mb-2.5 font-display text-lg font-bold">Variants of {mode.meta.title}</legend>
        <div ref={list} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => {
            const meta = v?.meta;
            return (
              <RadioCard key={meta?.id ?? 'standard'} name="host-variant" checked={(choice.variant?.meta.id ?? null) === (meta?.id ?? null)} onSelect={() => onChange({ mode, variant: v })}>
                <span className="min-w-0 flex-1 py-2 pr-9 pl-3">
                  <span className="flex flex-wrap items-center gap-x-2 font-bold">
                    {meta?.title ?? 'Standard rules'}
                    {meta?.status === 'beta' ? <Badge tone="amber">Beta</Badge> : null}
                  </span>
                  <span className="line-clamp-2 block text-sm text-text-2">{meta?.tagline ?? mode.meta.tagline}</span>
                </span>
              </RadioCard>
            );
          })}
        </div>
      </fieldset>
      {shown.length < options.length ? (
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            setFocusFrom(shown.length);
            setAll(true);
          }}
        >
          Show all {mode.variants.length} variants
        </Button>
      ) : null}
    </div>
  );
}

/** How many columns a CSS grid has right now. */
function useColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

type Kind = ModeCategory | 'all';

/**
 * Modes by kind, as on the game modes page: one grid, in the same order, with the
 * same filter. The chosen mode's variants open in a row of their own straight
 * under the row of the chosen mode.
 */
function ModeGrid({ modes, value, onChange }: { modes: CatalogEntry[]; value: Choice | null; onChange: (c: Choice) => void }) {
  const [kind, setKind] = useState<Kind>('all');
  const grid = useRef<HTMLDivElement>(null);
  const columns = useColumns(grid);
  const ordered = MODE_CATEGORIES.flatMap((c) => modes.filter((m) => m.meta.category === c));
  const shown = ordered.filter((m) => kind === 'all' || m.meta.category === kind);
  const count = (c: ModeCategory) => modes.filter((m) => m.meta.category === c).length;
  const at = shown.findIndex((m) => m.meta.id === value?.mode.meta.id);
  const rowEnd = at < 0 || !value?.mode.variants.length ? -1 : Math.min(shown.length, (Math.floor(at / columns) + 1) * columns) - 1;
  return (
    <>
      <ToggleChips<Kind>
        className="mb-4"
        value={kind}
        onChange={setKind}
        label="Show modes by kind"
        options={[
          { value: 'all', label: 'All' },
          ...MODE_CATEGORIES.filter((c) => count(c) > 0).map((c) => ({
            value: c,
            // A real space, not a margin, so the chip's name reads "Party 4" rather than "Party4".
            label: (
              <>
                {MODE_CATEGORY_INFO[c].label} <span className="opacity-70 tabular">{count(c)}</span>
              </>
            ),
          })),
        ]}
      />
      <fieldset aria-labelledby="host-step-mode" className="min-w-0">
        <div ref={grid} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m, i) => {
            const variants = m.variants.length;
            return [
              <RadioCard key={m.meta.id} name="host-mode" checked={value?.mode.meta.id === m.meta.id} onSelect={() => onChange({ mode: m, variant: null })}>
                <ModeArt thumb={thumbFor(m.meta)} className="w-20 shrink-0 self-stretch sm:w-24" />
                <span className="min-w-0 flex-1 py-2.5 pr-9 pl-3">
                  <span className="flex flex-wrap items-center gap-x-2 font-display text-lg leading-tight font-bold">
                    {m.meta.title}
                    {m.meta.status === 'beta' ? <Badge tone="amber">Beta</Badge> : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-text-2">{m.meta.tagline}</span>
                  <span className="mt-1 block text-xs font-semibold text-text-2">
                    {MODE_CATEGORY_INFO[m.meta.category].label}
                    {variants ? `, ${variants} ${variants === 1 ? 'variant' : 'variants'}` : ''}
                  </span>
                </span>
              </RadioCard>,
              i === rowEnd && value ? (
                <div key={`${m.meta.id}-variants`} className="col-span-full">
                  <VariantPicker key={value.mode.meta.id} choice={value} onChange={onChange} />
                </div>
              ) : null,
            ];
          })}
        </div>
      </fieldset>
      {at < 0 && value ? (
        <p className="mt-3 text-sm text-text-2">
          You chose {value.variant?.meta.title ?? value.mode.meta.title}, from {MODE_CATEGORY_INFO[value.mode.meta.category].label}.{' '}
          <button type="button" onClick={() => setKind(value.mode.meta.category)} className="font-semibold text-link underline underline-offset-2">
            Show {MODE_CATEGORY_INFO[value.mode.meta.category].label}
          </button>
        </p>
      ) : null}
    </>
  );
}

function ModePicker({ value, onChange, solo }: { value: Choice | null; onChange: (c: Choice) => void; solo: boolean }) {
  const modes = useModes();
  const list = useMemo(() => offered(modes.data?.modes ?? [], solo), [modes.data, solo]);
  if (modes.isError && !modes.data) return <ErrorNotice message="Game modes could not be loaded." onRetry={() => void modes.refetch()} />;
  if (modes.isPending) {
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  return <ModeGrid modes={list} value={value} onChange={onChange} />;
}

/* ----------------------------------- settings ------------------------------------ */

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

/* ------------------------------------- page -------------------------------------- */

/**
 * Keyboard focus must never land under the sticky Create bar or the page header.
 * Scroll padding on the page keeps a focused control clear of both; the bar is
 * measured, since its height changes with its text and the screen size.
 */
function useScrollPadding(bar: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const offset = parseFloat(getComputedStyle(el).bottom) || 0;
      root.style.scrollPaddingBottom = `${Math.ceil(el.getBoundingClientRect().height + offset + 12)}px`;
    };
    root.style.scrollPaddingTop = 'calc(4rem + 12px)';
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      root.style.scrollPaddingBottom = '';
      root.style.scrollPaddingTop = '';
    };
  }, [bar]);
}

function Setup({ solo, preset }: { solo: boolean; preset: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [set, setSet] = useState<SetSummary | null>(null);
  // Whether the set was just picked or just un-picked, so focus follows the picker folding and unfolding.
  const [setFocus, setSetFocus] = useState<'chosen' | 'picker' | null>(null);
  // The set editor's Host button links here with ?set=<id>; start with that set picked.
  const presetSet = useQuery({
    queryKey: ['set', preset],
    queryFn: () => api.get<{ set: SetSummary }>(`/api/sets/${preset}`),
    enabled: Boolean(preset),
  });
  const presetData = presetSet.data?.set;
  const presetApplied = useRef(false);
  useEffect(() => {
    if (!presetData || presetApplied.current) return;
    presetApplied.current = true;
    setSet((current) => current ?? presetData);
  }, [presetData]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [common, setCommon] = useState<Record<string, number | boolean>>({});
  const [options, setOptions] = useState({ lateJoin: true, generatedNames: false, requireAccount: false });
  const [busy, setBusy] = useState(false);
  const [atLimit, setAtLimit] = useState(false);
  const openGamesHeading = useRef<HTMLHeadingElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useScrollPadding(bar);
  const locked = useMemo(() => new Set(choice?.variant?.locked ?? []), [choice]);
  const effective = (k: string, fallback: unknown) => (k in settings ? settings[k] : (choice?.variant?.settings?.[k] ?? fallback));
  // Host choice, then the variant's preset, then the mode's own default.
  const commonValue = (k: CommonField): number => Number(common[k] ?? choice?.variant?.common?.[k] ?? choice?.mode.meta.common.defaults[k] ?? COMMON_FALLBACK[k]);
  const open = useOpenGames(!solo).data;

  /** Take the host to their open games to close one, if they have as many open as they may. */
  const showLimit = async (): Promise<boolean> => {
    await qc.refetchQueries({ queryKey: openGamesKey });
    const now = qc.getQueryData<{ rooms: OpenGame[]; limit: number }>(openGamesKey);
    if (!now || now.rooms.length < now.limit) return false;
    setAtLimit(true);
    setTimeout(() => {
      const heading = openGamesHeading.current;
      heading?.scrollIntoView({ block: 'start' });
      heading?.focus({ preventScroll: true });
    }, 50);
    return true;
  };

  const create = async () => {
    if (!set || !choice) return;
    setBusy(true);
    try {
      // The list already says there is no room: check it is current rather than asking for a game the server will refuse.
      if (!solo && open && open.rooms.length >= open.limit && (await showLimit())) return;
      const res = await api.post<{ code: string }>('/api/rooms', {
        setId: set.id,
        modeId: choice.mode.meta.id,
        variantId: choice.variant?.meta.id ?? null,
        settings,
        common,
        options,
        solo,
      });
      void qc.invalidateQueries({ queryKey: openGamesKey });
      navigate(`/room/${res.code}`);
    } catch (err) {
      // Hosting refuses a new game as a conflict only when too many are open (games opened in another tab, say).
      if (!solo && err instanceof ApiError && err.status === 409 && err.code === 'conflict' && (await showLimit())) return;
      toast.error(err instanceof ApiError ? err.message : 'Could not create the game.');
    } finally {
      setBusy(false);
    }
  };

  const full = Boolean(open && open.rooms.length >= open.limit);
  const meta = choice?.mode.meta;
  return (
    <>
      <PageHeader title={solo ? 'Play solo' : 'Host a game'} description={solo ? 'Practise any self-paced mode on your own. Solo games earn a little less, so playing together stays the best way to earn.' : 'Pick what to play, then share the code with your players.'} />
      <div className="flex flex-col gap-6">
        {!solo ? (
          <OpenGames
            ref={openGamesHeading}
            notice={
              atLimit ? (
                full ? (
                  <p role="alert" className="mb-3 rounded-[12px] border-2 border-lantern-deep bg-lantern/15 px-3.5 py-2.5 font-semibold">
                    You have {open?.limit} games open, the most you can have at once. Close one, then press Create game again.
                  </p>
                ) : (
                  <p role="status" className="mb-3 rounded-[12px] border-2 border-glim bg-glim/15 px-3.5 py-2.5 font-semibold">
                    There is room for a new game now. Press Create game when you are ready.
                  </p>
                )
              ) : null
            }
          />
        ) : null}
        <Panel className="p-5" aria-labelledby="host-step-set">
          <h2 id="host-step-set" className="mb-3 font-display text-xl font-bold">
            1. Questions
          </h2>
          {set ? (
            <ChosenSet
              set={set}
              focusOnMount={setFocus === 'chosen'}
              onChange={() => {
                setSet(null);
                setSetFocus('picker');
              }}
            />
          ) : preset && presetSet.isPending ? (
            <Skeleton className="h-[78px]" />
          ) : (
            <>
              {preset && presetSet.isError && !setFocus ? (
                <div className="mb-3">
                  <ErrorNotice title="That set could not be opened" message="It may be private, or it was deleted. Pick another set below." />
                </div>
              ) : null}
              <SetPicker
                focusOnMount={setFocus === 'picker'}
                onPick={(s) => {
                  setSet(s);
                  setSetFocus('chosen');
                }}
              />
            </>
          )}
        </Panel>
        <Panel className="p-5" aria-labelledby="host-step-mode">
          <h2 id="host-step-mode" className="mb-4 font-display text-xl font-bold">
            2. Game mode
          </h2>
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
          <Panel className="p-5" aria-labelledby="host-step-settings">
            <h2 id="host-step-settings" className="mb-1 font-display text-xl font-bold">
              3. Settings
            </h2>
            <p className="mb-4 text-sm text-text-2">{choice.variant ? choice.variant.meta.changes : meta.description}</p>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {meta.common.fields.map((k) => (
                <CommonInput key={k} field={k} meta={meta} value={commonValue(k)} locked={locked.has(k)} onChange={(v) => setCommon((c) => ({ ...c, [k]: v }))} />
              ))}
              {meta.teams !== 'none' && !solo ? (
                <Field label="Teams" hint={meta.teams === 'required' ? 'This mode is always played in teams.' : choice.variant?.common?.teamCount ? 'This variant is always played in teams.' : undefined}>
                  {(p) => (
                    <Select {...p} value={String(common.teamCount ?? choice.variant?.common?.teamCount ?? (meta.teams === 'required' ? 2 : 0))} onChange={(e) => setCommon((c) => ({ ...c, teamCount: Number(e.target.value) }))}>
                      {meta.teams === 'optional' && !choice.variant?.common?.teamCount ? <option value="0">No teams</option> : null}
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
                  <Users className="size-5 text-text-3" aria-hidden /> Room
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
        <div ref={bar} className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-raised/95 p-4 backdrop-blur lg:bottom-4">
          <p className="min-w-0 text-sm text-text-2">
            {!set ? 'Choose a question set.' : !choice ? 'Choose a game mode.' : `${choice.variant?.meta.title ?? choice.mode.meta.title} with “${set.title}”.`}
          </p>
          <Button variant="primary" size="lg" disabled={!set || !choice} loading={busy} onClick={create}>
            {solo ? 'Start playing' : 'Create game'}
          </Button>
        </div>
        <p className="text-center text-sm text-text-3">
          Want your own questions?{' '}
          <Link to="/sets/new" className="font-semibold underline underline-offset-2">
            Make a set
          </Link>
          .
        </p>
      </div>
    </>
  );
}

export default function HostSetup() {
  const me = useMe();
  const [params] = useSearchParams();
  const solo = params.get('solo') === '1';
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title={solo ? 'Play solo' : 'Host a game'} />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title={solo ? 'Play solo' : 'Host a game'} />
        <EmptyState title="Sign in to host" action={<ButtonLink to={`/signin?next=${encodeURIComponent(`/host${solo ? '?solo=1' : ''}`)}`} variant="primary">Sign in</ButtonLink>}>
          Hosting needs an account (a guest account is fine). Players joining your game do not need one.
        </EmptyState>
      </>
    );
  }
  // Hosting and playing solo offer different modes, so switching between them starts afresh.
  return <Setup key={solo ? 'solo' : 'host'} solo={solo} preset={params.get('set')} />;
}
