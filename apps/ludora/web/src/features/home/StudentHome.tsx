import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronRight, Flame, Pencil, Play, RotateCcw, Star, Target, X } from 'lucide-react';
import { GOAL_LIMITS, SUBJECT_LABELS, type GoalMetric, type Subject } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { thumbFor, useModes, useOverview } from '../../lib/queries.ts';
import { formatDay, formatNumber, plural, timeAgo, untilText } from '../../lib/format.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Amount, Dialog, ErrorNotice, Input, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { SetCover } from '../sets/SetCover.tsx';
import { useClassList } from '../classes/classData.ts';
import { CardTitle, ProgressRing } from '../profile/parts.tsx';
import { errorMessage, extrasKey, useExtras } from '../profile/extras.ts';

/*
 * The parts of home that give a player reasons to come back: first steps for
 * someone new, today's challenge, the mistakes waiting to be fixed, the weekly
 * goal they set, their favourites, what they played lately and last week's
 * recap. Every number comes from the server; nothing here pays a reward.
 */

interface Daily {
  day: string;
  resets: string;
  challenge: { set: { id: string; title: string; subject: string; cover: { glyph: string; hue: number } | null }; modeId: string; mode: string; questions: number } | null;
  streak: number;
  longest: number;
  doneToday: boolean;
  recent: string[];
}

interface GoalData {
  goal: { metric: GoalMetric; target: number } | null;
  progress: number;
  week: { games: number; correct: number };
  resets: string;
}

interface RecentGame {
  modeId: string;
  variantId: string | null;
  title: string;
  setId: string;
  setTitle: string;
  subject: string;
  cover: { glyph: string; hue: number } | null;
  endedAt: string;
  correct: number;
  answered: number;
  solo: boolean;
}

interface Recap {
  weekOf: string;
  weekEnds: string;
  games: number;
  wins: number;
  correct: number;
  answered: number;
  modes: { title: string; games: number }[];
  improved: { subject: string; from: number; to: number } | null;
  earned: Record<string, number>;
  achievements: string[];
  newGlims: number;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => formatDay(iso, opts);

/** Start a solo practice room on the server and go to it. */
function useStart(path: string, failure: string) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post<{ code: string }>(path),
    onSuccess: (r) => navigate(`/room/${r.code}`),
    onError: (err) => toast.error(errorMessage(err, failure)),
  });
}

/* --------------------------------- first steps -------------------------------- */

function Step({ done, title, text, to, action }: { done: boolean; title: string; text: string; to: string; action: string }) {
  return (
    <li className={`flex items-center gap-3 rounded-[var(--radius-m)] p-3 ${done ? 'bg-glim/10' : 'bg-surface-2'}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? 'bg-glim text-on-accent' : 'border-2 border-line-strong text-text-3'}`} aria-hidden>
        {done ? <Check className="size-5" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-bold ${done ? 'text-text-2 line-through decoration-2' : ''}`}>
          {title}
          <span className="sr-only">{done ? ', done' : ', to do'}</span>
        </p>
        <p className="text-sm text-text-2">{text}</p>
      </div>
      {!done ? (
        <ButtonLink to={to} size="sm" className="shrink-0">
          {action}
        </ButtonLink>
      ) : null}
    </li>
  );
}

/**
 * Three steps for a new player, or a "host your first game" checklist for a new teacher. Each
 * step ticks itself off from what the account has really done. Closed for good with the cross,
 * and gone once every step is done.
 */
function FirstSteps() {
  const me = useMe();
  const qc = useQueryClient();
  const overview = useOverview();
  const extras = useExtras();
  const user = me.data?.user;
  const teacher = user?.accountType === 'teacher';
  const key = teacher ? 'teacher-start' : 'first-steps';
  const classes = useClassList(Boolean(teacher));
  const mySets = useQuery({ queryKey: ['sets', { scope: 'mine' }, 'count'], queryFn: () => api.get<{ total: number }>('/api/sets?scope=mine'), enabled: Boolean(teacher) });
  const dismiss = useMutation({
    mutationFn: () => api.post(`/api/me/help/${key}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: extrasKey }),
    onError: (err) => toast.error(errorMessage(err, 'That did not close. Try again.')),
  });
  const o = overview.data;
  const e = extras.data;
  if (!user || !o || !e || e.help.dismissed.includes(key)) return null;

  let steps: { done: boolean; title: string; text: string; to: string; action: string }[];
  if (teacher) {
    if (!classes.data || !mySets.data) return null;
    const teaching = classes.data.teaching ?? [];
    steps = [
      { done: mySets.data.total > 0 || o.stats.gamesHosted > 0, title: 'Choose your questions', text: 'Write a set, import a spreadsheet or use one of the built-in sets.', to: '/library', action: 'Question sets' },
      { done: o.stats.gamesHosted > 0, title: 'Host your first game', text: 'Pick a mode, put the code on the board, and the class joins from their devices.', to: '/host', action: 'Host a game' },
      { done: teaching.length > 0, title: 'Make a class', text: 'Students join with a code. No email addresses needed.', to: '/classes?new=1', action: 'Make a class' },
      { done: teaching.some((c) => c.assignments > 0), title: 'Set some homework', text: 'An assignment is a game students play on their own, with a report for you.', to: '/classes', action: 'Your classes' },
    ];
  } else {
    if (o.stats.gamesPlayed >= 10) return null;
    steps = [
      { done: o.stats.gamesPlayed > 0, title: 'Play your first game', text: 'Join with a code from your teacher, or play a mode on your own.', to: '/host?solo=1', action: 'Play solo' },
      { done: o.stats.packsOpened > 0, title: 'Open a Lantern', text: 'Spend the Sparks you earn to find new Glims for your collection.', to: '/shop?tab=lanterns', action: 'Open one' },
      { done: Boolean(e.goal), title: 'Set a weekly goal', text: 'Choose how many games or right answers to aim for this week.', to: '#weekly-goal', action: 'Set a goal' },
    ];
  }
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="first-steps-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="first-steps-title" className="font-display text-[1.75rem] leading-tight font-bold">
            {teacher ? 'Host your first game' : 'Get started'}
          </h2>
          <p className="text-sm text-text-2">
            {done} of {steps.length} done
          </p>
        </div>
        <IconButton label={teacher ? 'Close the first game checklist' : 'Close getting started'} onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>
      <ol className={`grid grid-cols-1 gap-2 ${teacher ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {steps.map((s) => (
          <Step key={s.title} {...s} />
        ))}
      </ol>
    </Panel>
  );
}

/* ------------------------------- daily challenge ------------------------------ */

function DailyCard() {
  const daily = useQuery({ queryKey: ['daily'], queryFn: () => api.get<Daily>('/api/me/daily') });
  const start = useStart('/api/me/daily/play', 'The daily challenge did not start. Try again.');
  const d = daily.data;
  // The last seven days, oldest first, each marked done or not.
  const week = d ? Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${d.day}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - (6 - i));
    const iso = day.toISOString().slice(0, 10);
    return { iso, done: d.recent.includes(iso), today: iso === d.day };
  }) : [];
  return (
    <Panel className="flex flex-col p-5" aria-labelledby="daily-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 id="daily-title" className="font-display text-[1.6rem] leading-tight font-bold">
          Daily challenge
        </h2>
        {d && d.streak > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-s)] bg-lantern px-2 py-0.5 font-display text-lg leading-6 font-bold text-on-accent tabular">
            <Flame className="size-4" aria-hidden />
            {d.streak}
            <span className="sr-only">{d.streak === 1 ? 'day in a row' : 'days in a row'}</span>
          </span>
        ) : null}
      </div>
      {daily.isError ? (
        <ErrorNotice message="Today's challenge did not load." onRetry={() => void daily.refetch()} />
      ) : !d ? (
        <Skeleton className="h-36" />
      ) : !d.challenge ? (
        <p className="text-sm text-text-2">There is no challenge today. Try a game mode instead.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <SetCover cover={d.challenge.set.cover} subject={d.challenge.set.subject} size={52} />
            <div className="min-w-0">
              <p className="font-bold break-words">{d.challenge.set.title}</p>
              <p className="text-sm text-text-2">
                {d.challenge.mode}, {d.challenge.questions} questions
              </p>
            </div>
          </div>
          <ol className="mt-4 flex gap-1.5" aria-label="The last seven days">
            {week.map((w) => (
              <li key={w.iso} className="flex flex-1 flex-col items-center gap-1">
                <span className={`grid size-8 place-items-center rounded-full text-xs font-bold ${w.done ? 'bg-lantern text-on-accent' : w.today ? 'border-2 border-lantern text-text' : 'bg-surface-3 text-text-3'}`} aria-hidden>
                  {w.done ? <Check className="size-4" /> : dayLabel(w.iso, { weekday: 'narrow' })}
                </span>
                <span className="sr-only">
                  {dayLabel(w.iso, { weekday: 'long' })}: {w.done ? 'done' : w.today ? 'today, not done yet' : 'missed'}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-4">
            <Button variant={d.doneToday ? 'secondary' : 'primary'} className="w-full" icon={d.doneToday ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} loading={start.isPending} onClick={() => start.mutate()}>
              {d.doneToday ? 'Play it again' : "Play today's challenge"}
            </Button>
            <p className="mt-2 text-center text-sm text-text-2">{d.doneToday ? `Done for today. A new one in ${untilText(d.resets)}.` : d.streak ? `Keep your ${d.streak}-day run going.` : 'Five questions. Do one every day for a streak.'}</p>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------- mistakes ---------------------------------- */

function MistakesCard() {
  const list = useQuery({ queryKey: ['mistakes'], queryFn: () => api.get<{ total: number }>('/api/me/mistakes') });
  const start = useStart('/api/me/mistakes/play', 'The round did not start. Try again.');
  const n = list.data?.total ?? 0;
  return (
    <Panel className="flex flex-col p-5" aria-labelledby="mistakes-title">
      <h2 id="mistakes-title" className="mb-3 font-display text-[1.6rem] leading-tight font-bold">
        My mistakes
      </h2>
      {list.isError ? (
        <ErrorNotice message="Your mistakes did not load." onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-36" />
      ) : n === 0 ? (
        <div className="flex flex-1 flex-col">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[3rem] leading-none font-extrabold tabular">0</span>
            <span className="text-text-2">to fix</span>
          </p>
          <p className="mt-2 text-sm text-text-2">Questions you get wrong in games land here, so you can try them again. Nothing waiting right now.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[3rem] leading-none font-extrabold tabular">{formatNumber(n)}</span>
            <span className="text-text-2">{n === 1 ? 'question to fix' : 'questions to fix'}</span>
          </p>
          <p className="mt-2 text-sm text-text-2">Get one right on two different days and it leaves the list.</p>
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <Button variant="primary" className="w-full" icon={<Target className="size-4" aria-hidden />} loading={start.isPending} onClick={() => start.mutate()}>
              Fix my mistakes
            </Button>
            <Link to="/mistakes" className="inline-flex min-h-11 items-center justify-center text-sm font-semibold">
              See the list
            </Link>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- weekly goal ------------------------------- */

function GoalDialog({ open, onClose, current }: { open: boolean; onClose: () => void; current: GoalData['goal'] }) {
  const qc = useQueryClient();
  const [metric, setMetric] = useState<GoalMetric>(current?.metric ?? 'games');
  const [target, setTarget] = useState(String(current?.target ?? GOAL_LIMITS.games.default));
  const limits = GOAL_LIMITS[metric];
  const value = Number(target);
  const valid = Number.isInteger(value) && value >= limits.min && value <= limits.max;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['goal'] }), qc.invalidateQueries({ queryKey: extrasKey })]);
  const save = useMutation({
    mutationFn: () => api.put('/api/me/goal', { metric, target: value }),
    onSuccess: async () => {
      await refresh();
      toast.success(`Goal set: ${plural(value, limits.unit[0], limits.unit[1])} this week`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Your goal did not save. Try again.')),
  });
  const clear = useMutation({
    mutationFn: () => api.delete('/api/me/goal'),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Your goal did not change. Try again.')),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Your weekly goal"
      description="Something to aim for each week, Monday to Sunday. Only you see it."
      size="sm"
      footer={
        <>
          {current ? (
            <Button variant="ghost" onClick={() => clear.mutate()} loading={clear.isPending}>
              Remove goal
            </Button>
          ) : null}
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Save goal
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <div>
          <p className="mb-1.5 text-sm font-semibold" id="goal-metric">
            Count
          </p>
          <Segmented<GoalMetric>
            label="Count"
            value={metric}
            onChange={(m) => {
              setMetric(m);
              setTarget(String(GOAL_LIMITS[m].default));
            }}
            options={[
              { value: 'games', label: GOAL_LIMITS.games.label },
              { value: 'correct', label: GOAL_LIMITS.correct.label },
            ]}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">How many each week</span>
          <Input type="number" inputMode="numeric" min={limits.min} max={limits.max} value={target} onChange={(ev) => setTarget(ev.target.value)} aria-invalid={!valid} aria-describedby="goal-hint" className="h-11 w-32" />
          <span id="goal-hint" className={`text-sm ${valid ? 'text-text-2' : 'font-semibold text-text'}`}>
            {valid ? `Between ${limits.min} and ${formatNumber(limits.max)}.` : `Choose a number from ${limits.min} to ${formatNumber(limits.max)}.`}
          </span>
        </label>
      </form>
    </Dialog>
  );
}

function GoalCard() {
  const goal = useQuery({ queryKey: ['goal'], queryFn: () => api.get<GoalData>('/api/me/goal') });
  const [editing, setEditing] = useState(false);
  const g = goal.data;
  const unit = g?.goal ? GOAL_LIMITS[g.goal.metric].unit : null;
  const met = Boolean(g?.goal && g.progress >= g.goal.target);
  return (
    <Panel className="flex flex-col p-5" aria-labelledby="weekly-goal-title" id="weekly-goal">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 id="weekly-goal-title" className="font-display text-[1.6rem] leading-tight font-bold">
          Weekly goal
        </h2>
        {g?.goal ? (
          <IconButton label="Change your weekly goal" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
          </IconButton>
        ) : null}
      </div>
      {goal.isError ? (
        <ErrorNotice message="Your goal did not load." onRetry={() => void goal.refetch()} />
      ) : !g ? (
        <Skeleton className="h-36" />
      ) : !g.goal ? (
        <div className="flex flex-1 flex-col">
          <p className="text-sm text-text-2">
            Set yourself a target: a number of games or right answers each week. This week so far: {plural(g.week.games, 'game')}, {plural(g.week.correct, 'right answer')}.
          </p>
          <div className="mt-auto pt-4">
            <Button variant="primary" className="w-full" icon={<Target className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
              Set a goal
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-4">
          <ProgressRing value={g.progress} max={g.goal.target} label={`${formatNumber(Math.min(g.progress, g.goal.target))} of ${plural(g.goal.target, unit![0], unit![1])} this week`} tone={met ? 'var(--glim)' : 'var(--lantern)'}>
            <span>
              <span className="block font-display text-[2rem] leading-none font-extrabold tabular">{formatNumber(g.progress)}</span>
              <span className="block text-xs font-semibold text-text-2 tabular">of {formatNumber(g.goal.target)}</span>
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="font-bold">{met ? 'Goal reached' : `${formatNumber(g.goal.target - g.progress)} to go`}</p>
            <p className="text-sm text-text-2">{unit![1].replace(/^./, (c) => c.toUpperCase())} this week. Starts again in {untilText(g.resets)}.</p>
          </div>
        </div>
      )}
      {editing ? <GoalDialog open onClose={() => setEditing(false)} current={g?.goal ?? null} /> : null}
    </Panel>
  );
}

/** Today's challenge, the mistakes list and the weekly goal, side by side. Signed-in accounts only. */
export function StudentToday() {
  const me = useMe();
  if (!me.data?.user) return null;
  return (
    <>
      <FirstSteps />
      <section aria-label="Today" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DailyCard />
        <MistakesCard />
        <GoalCard />
      </section>
    </>
  );
}

/* ------------------------------ favourites and recent ------------------------- */

function FavouritesPanel() {
  const extras = useExtras();
  const modes = useModes();
  const e = extras.data;
  const favModes = e ? e.favourites.modes.map((id) => modes.data?.modes.find((m) => m.meta.id === id)).filter((m): m is NonNullable<typeof m> => Boolean(m)) : [];
  const favSets = e?.favouriteSets ?? [];
  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="favourites-title">
      <CardTitle id="favourites-title" action={<Link to="/modes" className="text-sm font-semibold">Find more</Link>}>
        Favourites
      </CardTitle>
      {extras.isError ? (
        <ErrorNotice message="Your favourites did not load." onRetry={() => void extras.refetch()} />
      ) : !e ? (
        <Skeleton className="h-28" />
      ) : favModes.length === 0 && favSets.length === 0 ? (
        <div className="flex items-center gap-4 rounded-[var(--radius-m)] bg-surface-2 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] bg-lantern text-on-accent" aria-hidden>
            <Star className="size-6" />
          </span>
          <p className="text-sm text-text-2">
            <span className="block font-bold text-text">Nothing starred yet</span>
            Press the star on a game mode or a question set and it shows up here, one tap away.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {favModes.slice(0, 4).map((m) => (
            <li key={m.meta.id}>
              <Link to={`/modes/${m.meta.id}`} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-2 pr-3 text-text no-underline transition-colors hover:bg-surface-3">
                <ModeArt thumb={thumbFor(m.meta)} mode={m.meta} className="h-12 w-[4.5rem] shrink-0 overflow-hidden rounded-[var(--radius-s)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{m.meta.title}</span>
                  <span className="block truncate text-sm text-text-2">{m.meta.tagline}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
              </Link>
            </li>
          ))}
          {favSets.slice(0, 4).map((s) => (
            <li key={s.id}>
              <Link to={`/sets/${s.id}`} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-2 pr-3 text-text no-underline transition-colors hover:bg-surface-3">
                <span className="grid w-[4.5rem] shrink-0 place-items-center">
                  <SetCover cover={s.cover} subject={s.subject} size={44} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.title}</span>
                  <span className="block truncate text-sm text-text-2">
                    {SUBJECT_LABELS[s.subject as Subject] ?? s.subject}, {plural(s.questionCount, 'question')}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentPanel() {
  const navigate = useNavigate();
  const recent = useQuery({ queryKey: ['recent-played'], queryFn: () => api.get<{ games: RecentGame[] }>('/api/me/recent') });
  const [starting, setStarting] = useState<string | null>(null);
  const again = async (g: RecentGame) => {
    // Modes that need a crowd go to the host page with the set picked; the rest start a solo game straight away.
    if (!g.solo) {
      navigate(`/host?set=${encodeURIComponent(g.setId)}`);
      return;
    }
    const key = `${g.variantId ?? g.modeId}|${g.setId}`;
    setStarting(key);
    try {
      const r = await api.post<{ code: string }>('/api/rooms', { setId: g.setId, modeId: g.modeId, variantId: g.variantId, solo: true });
      navigate(`/room/${r.code}`);
    } catch (err) {
      setStarting(null);
      toast.error(errorMessage(err, 'That game did not start. Try again.'));
    }
  };
  const list = recent.data?.games ?? [];
  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="played-title">
      <CardTitle id="played-title" action={<Link to="/me" className="text-sm font-semibold">My stats</Link>}>
        Recently played
      </CardTitle>
      {recent.isError ? (
        <ErrorNotice message="Your recent games did not load." onRetry={() => void recent.refetch()} />
      ) : !recent.data ? (
        <Skeleton className="h-28" />
      ) : list.length === 0 ? (
        <p className="rounded-[var(--radius-m)] bg-surface-2 p-4 text-sm text-text-2">Games you play show up here with Play again, so you can have another go at the same questions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.slice(0, 4).map((g) => {
            const key = `${g.variantId ?? g.modeId}|${g.setId}`;
            return (
              <li key={key} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-2.5">
                <SetCover cover={g.cover} subject={g.subject} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{g.setTitle}</p>
                  <p className="truncate text-sm text-text-2">
                    {g.title}, {timeAgo(g.endedAt)}
                  </p>
                </div>
                <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} loading={starting === key} disabled={starting !== null && starting !== key} onClick={() => void again(g)} aria-label={`Play again: ${g.title}, ${g.setTitle}`}>
                  {g.solo ? 'Play again' : 'Host again'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------------- weekly recap ------------------------------- */

function RecapCard() {
  const recap = useQuery({ queryKey: ['recap'], queryFn: () => api.get<Recap>('/api/me/recap'), staleTime: 300_000 });
  const r = recap.data;
  if (!r || r.games === 0) return null;
  const range = `${dayLabel(r.weekOf, { day: 'numeric', month: 'short' })} to ${dayLabel(r.weekEnds, { day: 'numeric', month: 'short' })}`;
  const currencies = Object.entries(r.earned).filter(([, n]) => n > 0);
  return (
    <section className="stage-card on-stage stage overflow-hidden rounded-[var(--radius-l)] p-5 sm:p-6" aria-labelledby="recap-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="plate plate-gold text-base">
            <span>Last week</span>
          </span>
          <h2 id="recap-title" className="mt-2 font-display text-[2rem] leading-none font-bold">
            Your week in Ludora
          </h2>
          <p className="mt-1 text-sm text-text-2">{range}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Games', value: formatNumber(r.games) },
          { label: 'Right answers', value: formatNumber(r.correct) },
          { label: 'Accuracy', value: r.answered ? pct(r.correct / r.answered) : 'None yet' },
          { label: 'Wins', value: formatNumber(r.wins) },
        ].map((s) => (
          <div key={s.label} className="hud rounded-[var(--radius-m)] px-3.5 py-3">
            <dt className="text-xs font-semibold text-text-2">{s.label}</dt>
            <dd className="font-display text-[2rem] leading-none font-extrabold tabular">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="hud rounded-[var(--radius-m)] p-3.5">
          <h3 className="text-sm font-semibold text-text-2">What you played</h3>
          <ul className="mt-1">
            {r.modes.map((m) => (
              <li key={m.title} className="flex justify-between gap-2 font-semibold">
                <span className="truncate">{m.title}</span>
                <span className="shrink-0 tabular">{plural(m.games, 'game')}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="hud rounded-[var(--radius-m)] p-3.5">
          <h3 className="text-sm font-semibold text-text-2">What you got better at</h3>
          {r.improved ? (
            <p className="mt-1 font-semibold">
              {SUBJECT_LABELS[r.improved.subject as Subject] ?? r.improved.subject}: <span className="tabular">{pct(r.improved.from)}</span> to <span className="text-glim tabular">{pct(r.improved.to)}</span> right
            </p>
          ) : (
            <p className="mt-1 text-sm text-text-2">Play the same subject two weeks running to see how you are improving.</p>
          )}
        </div>
        <div className="hud rounded-[var(--radius-m)] p-3.5">
          <h3 className="text-sm font-semibold text-text-2">What you earned</h3>
          {currencies.length || r.newGlims || r.achievements.length ? (
            <ul className="mt-1 flex flex-col gap-0.5 font-semibold">
              {currencies.length ? (
                <li className="flex flex-wrap gap-x-3">
                  {currencies.map(([c, n]) => (
                    <Amount key={c} currency={c} value={n} size="sm" />
                  ))}
                </li>
              ) : null}
              {r.newGlims ? <li>{plural(r.newGlims, 'new Glim')}</li> : null}
              {r.achievements.slice(0, 2).map((a) => (
                <li key={a} className="truncate">
                  Achievement: {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-2">Answer a few more questions in a game to earn Sparks and XP.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Favourites, recently played and last week's recap: lower on home, under the quests. */
export function StudentMore() {
  const me = useMe();
  if (!me.data?.user) return null;
  return (
    <>
      <RecapCard />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FavouritesPanel />
        <RecentPanel />
      </div>
    </>
  );
}
