import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { CommonField, SettingField } from '@ludora/shared';
import { soloBlocker } from '@ludora/engine/catalog';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes, type CatalogEntry, type SetSummary } from '../../lib/queries.ts';
import { AccountError, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { OpenGames, openGamesKey, useOpenGames, type OpenGame } from './OpenGames.tsx';
import { SaveGameDialog, type MadeGame } from '../games/SaveGameDialog.tsx';
import { ChosenSet, ModeGrid, SetButton, type Choice } from './pickers.tsx';

/*
 * Setting up a game: a question set, a mode (then one of its variants), the
 * settings, and Create. Once a set is chosen its picker folds into one line.
 * Modes are sorted and filtered by kind as on the game modes page, and only
 * the chosen mode's variants are shown, under its row, so the page stays short.
 * Hosts who left games open see them at the top, to rejoin or close.
 */

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
                <SetButton set={s} detail={scope === 'public' && s.ownerName ? `, by ${s.ownerName}` : ''} onPick={() => onPick(s)} />
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

/* ----------------------------------- game mode ----------------------------------- */

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
  return <ModeGrid modes={list} value={value} onChange={onChange} labelledBy="host-step-mode" />;
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

/** A step's heading: its number on a gold tile, then its name. Read aloud as "1. Questions". */
function StepTitle({ id, n, children, className = 'mb-4' }: { id: string; n: number; children: string; className?: string }) {
  return (
    <h2 id={id} className={`flex items-center gap-2.5 font-display text-2xl leading-tight font-bold ${className}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-s)] bg-lantern text-xl text-on-accent tabular">{n}</span>
      <span className="sr-only">. </span>
      {children}
    </h2>
  );
}

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

function Setup({ solo, preset, gameId, making }: { solo: boolean; preset: string | null; gameId: string | null; making: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [set, setSet] = useState<SetSummary | null>(null);
  // Whether the set was just picked or just un-picked, so focus follows the picker folding and unfolding.
  const [setFocus, setSetFocus] = useState<'chosen' | 'picker' | null>(null);
  // A game from the Game Maker (?game=<id>) brings its mode, settings and set.
  const madeGame = useQuery({ queryKey: ['game', gameId], queryFn: () => api.get<{ game: MadeGame }>(`/api/games/${gameId}`), enabled: Boolean(gameId) });
  const game = madeGame.data?.game ?? null;
  const modes = useModes();
  // The set editor's Host button links here with ?set=<id>; start with that set picked.
  const presetId = preset ?? game?.set?.id ?? null;
  const presetSet = useQuery({
    queryKey: ['set', presetId],
    queryFn: () => api.get<{ set: SetSummary }>(`/api/sets/${presetId}`),
    enabled: Boolean(presetId),
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
  const [saving, setSaving] = useState(false);
  const [atLimit, setAtLimit] = useState(false);
  const gameApplied = useRef(false);
  useEffect(() => {
    if (!game || gameApplied.current || !modes.data) return;
    const entry = modes.data.modes.find((m) => m.meta.id === game.mode?.id);
    if (!entry) return;
    gameApplied.current = true;
    setChoice({ mode: entry, variant: entry.variants.find((v) => v.meta.id === game.variant?.id) ?? null });
    setSettings(game.settings);
    setCommon(game.common as Record<string, number | boolean>);
    setOptions((o) => ({ ...o, ...game.options }));
  }, [game, modes.data]);
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
        ...(game ? { gameId: game.id } : {}),
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
      <PageHeader
        title={game ? game.title : making ? 'Make a game' : solo ? 'Play solo' : 'Host a game'}
        description={
          game
            ? `${game.mine ? 'Your game' : `A game by ${game.owner.name}`}, built on ${game.variant?.title ?? game.mode?.title ?? 'a mode'}. Change anything before you start${game.mine ? ', and save it again if you like' : ''}.`
            : making
              ? 'Pick a question set and a mode (2D or 3D), tune the settings, then press Save as a game. You can host it any time, or share its link.'
              : solo
                ? 'Practise any self-paced mode on your own. Solo games earn a little less, so playing together stays the best way to earn.'
                : 'Pick what to play, then share the code with your players.'
        }
      />
      <div className="flex flex-col gap-6">
        {gameId && madeGame.isError ? <ErrorNotice title="That game could not be opened" message="It may be private, or it was deleted. You can still set up a game below." /> : null}
        {!solo ? (
          <OpenGames
            ref={openGamesHeading}
            notice={
              atLimit ? (
                full ? (
                  <p role="alert" className="mb-3 rounded-[var(--radius-m)] border border-lantern/70 bg-lantern/10 px-3.5 py-2.5 font-semibold">
                    You have {open?.limit} games open, the most you can have at once. Close one, then press Create game again.
                  </p>
                ) : (
                  <p role="status" className="mb-3 rounded-[var(--radius-m)] border border-glim/70 bg-glim/10 px-3.5 py-2.5 font-semibold">
                    There is room for a new game now. Press Create game when you are ready.
                  </p>
                )
              ) : null
            }
          />
        ) : null}
        <Panel className="p-5" aria-labelledby="host-step-set">
          <StepTitle id="host-step-set" n={1} className="mb-3">
            Questions
          </StepTitle>
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
          <StepTitle id="host-step-mode" n={2}>
            Game mode
          </StepTitle>
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
            <StepTitle id="host-step-settings" n={3} className="mb-1">
              Settings
            </StepTitle>
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
                <h3 className="mb-1 flex items-center gap-2 font-display text-xl font-bold">
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
        <div ref={bar} className="lift sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-l)] border border-line bg-raised/95 p-4 backdrop-blur lg:bottom-4">
          <p className="min-w-0 text-sm text-text-2">
            {!set ? 'Choose a question set.' : !choice ? 'Choose a game mode.' : `${choice.variant?.meta.title ?? choice.mode.meta.title} with “${set.title}”.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {!solo ? (
              <Button variant={making ? 'primary' : 'secondary'} size="lg" disabled={!set || !choice} onClick={() => setSaving(true)}>
                {game?.mine ? 'Save changes' : 'Save as a game'}
              </Button>
            ) : null}
            <Button variant={making ? 'secondary' : 'primary'} size="lg" disabled={!set || !choice} loading={busy} onClick={create}>
              {solo ? 'Start playing' : 'Create game'}
            </Button>
          </div>
        </div>
        {set && choice && saving ? (
          <SaveGameDialog
            open={saving}
            onOpenChange={setSaving}
            editing={game?.mine ? game : null}
            setup={{ setId: set.id, modeId: choice.mode.meta.id, variantId: choice.variant?.meta.id ?? null, settings, common, options, modeTitle: choice.variant?.meta.title ?? choice.mode.meta.title, hue: choice.mode.meta.thumbnail.hue }}
            onSaved={(g) => navigate(`/host?game=${g.id}`, { replace: true })}
          />
        ) : null}
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
  const gameId = params.get('game');
  return <Setup key={`${solo ? 'solo' : 'host'}-${gameId ?? ''}`} solo={solo} preset={params.get('set')} gameId={gameId} making={params.get('make') === '1'} />;
}
