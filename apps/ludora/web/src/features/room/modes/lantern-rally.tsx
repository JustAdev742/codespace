import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Bot, Flag, Gauge, Medal, ShieldCheck, Timer, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { Answer, PulseView, RoomPlayerView } from '@ludora/shared';
import { CIRCUITS, POINTS, PRIZE_INFO, type CircuitId, type Prize } from '@ludora/engine/lantern-rally';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { Button } from '../../../ui/Button.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx, useSfx } from '../../../lib/sound/react.tsx';
import type { PulseSource } from '../../../lib/useRoom.ts';
import { Stage3D, lookFor, type GlimLook } from '../../../three/index.ts';
import { FLAG, RallyField, type RallyPulse, type ViewKart } from './lantern-rally-field.ts';
import { RallyMap } from './lantern-rally-map.tsx';
import { RallyHostScene, RallyScene } from './lantern-rally-scene.ts';
import { eventLine, ordinal, raceWords, timeText, type RaceKind, type RallyEventView } from './lantern-rally-words.ts';

/*
 * Lantern Rally screens. The race is the picture (3D, or the circuit drawn
 * from above with 3D off); the controls are ordinary: Steer left, Boost and
 * Steer right (the arrow keys and B on a keyboard), an Auto-steer switch,
 * and the question beside them. The picture's label and a live region say
 * your place, lap and what just happened, in words.
 */

/* ---------------------------------- types --------------------------------- */

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  place: number;
  lap: number;
  finished: number | null;
  finishMs: number | null;
  bestLap: number | null;
  metres: number;
  points: number;
  isYou: boolean;
}

interface You {
  d: number;
  lane: number;
  v: number;
  charges: number;
  maxCharges: number;
  auto: boolean;
  place: number;
  lap: number;
  lapStart: number;
  lastLap: number | null;
  bestLap: number | null;
  finished: number | null;
  finishMs: number | null;
  boostUntil: number | null;
  glowUntil: number | null;
  slowUntil: number | null;
  coughUntil: number | null;
  shield: boolean;
  slip: boolean;
  canSteerAt: number;
  steadyUntil: number | null;
  points: number;
  gp: number[] | null;
  answers: number;
  answerCap: number;
  team: string | null;
  ghost: number[] | null;
  got: number[];
  events: RallyEventView[];
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
}

interface News {
  id: number;
  playerId: string;
  at: number;
  kind: 'lead' | 'pass' | 'finish' | 'final' | 'best';
  name: string;
  other: string | null;
  place: number;
  ms: number | null;
}

export interface RallyView {
  kind: RaceKind;
  phase: 'race' | 'break';
  race: number;
  races: number;
  circuit: CircuitId;
  length: number;
  laps: number | null;
  startAt: number;
  endsAt: number;
  whistleAt: number | null;
  breakUntil: number | null;
  items: [number, number, number][];
  odds: { prize: Prize; percent: number }[];
  at: number;
  racers: number;
  finished: number;
  fastest: { name: string; ms: number } | null;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; score: number; metres: number | null }[] | null;
  karts: ViewKart[];
  you?: You | null;
  news?: News[];
}

/* --------------------------------- shared --------------------------------- */

/** Kart colours, far enough apart to tell karts apart at a glance. */
const HUES = [205, 14, 130, 280, 45, 330, 170, 250, 90, 0, 190, 300];

/** Each driver's (or team's) kart colour: by their place in the room's list, so neighbours never clash. */
function useHues(room: ModeScreenProps['room']): (id: string) => number {
  const ref = useRef(room);
  ref.current = room;
  return useCallback((id: string) => {
    const teams = ref.current.room.teams ?? [];
    const team = teams.find((t) => t.id === id);
    if (team) return team.hue;
    const i = ref.current.players.findIndex((p) => p.id === id);
    if (i >= 0) return HUES[i % HUES.length]!;
    let h = 0;
    for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
    return HUES[h % HUES.length]!;
  }, []);
}

/** The client-side picture of the race: one per screen, fed every view and pulse. */
function useField(view: RallyView, meId: string | null, gameNow: () => number, pulse: PulseSource): RallyField {
  const clock = useRef(gameNow);
  clock.current = gameNow;
  const field = useMemo(() => new RallyField(meId, () => clock.current()), [meId]);
  useEffect(() => field.applyView(view), [field, view]);
  useEffect(() => {
    const last = pulse.latest() as PulseView<RallyPulse> | null;
    if (last) field.applyPulse(last);
    return pulse.subscribe((p) => field.applyPulse(p as PulseView<RallyPulse>));
  }, [field, pulse]);
  return field;
}

function useLooks(players: RoomPlayerView[]): (id: string) => GlimLook {
  const ref = useRef(players);
  ref.current = players;
  return useCallback((id: string) => lookFor(ref.current.find((p) => p.id === id)?.avatar, fallbackArt(id)), []);
}

/** Re-render every `ms` (timers and words that follow the game clock). */
function useTicker(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => (n + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** A value that changes at most once every `ms`, keeping the latest. */
function useSteady<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    const t = setTimeout(
      () => {
        last.current = Date.now();
        setShown(value);
      },
      Math.max(0, last.current + ms - Date.now()),
    );
    return () => clearTimeout(t);
  }, [value, ms]);
  return shown;
}

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'gold' }) {
  const colours = tone === 'gold' ? 'bg-lantern text-on-accent' : 'bg-black/55 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

function ChargePips({ charges, max }: { charges: number; max: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`inline-block h-3 w-2 rounded-sm ${i < charges ? 'bg-lantern' : 'bg-white/20'}`} />
      ))}
    </span>
  );
}

/** "3, 2, 1, go" over the picture. The words beside it say the same for screen readers. */
function Lights({ startAt, gameNow }: { startAt: number; gameNow: () => number }) {
  useTicker(200);
  const left = startAt - gameNow();
  if (left < -1200) return null;
  const text = left > 0 ? String(Math.ceil(left / 1000)) : 'Go!';
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
      <span className={`rounded-[var(--radius-l)] px-6 py-2 font-display text-6xl font-extrabold ${left > 0 ? 'bg-black/60 text-white' : 'bg-glim text-on-accent'}`}>{text}</span>
    </div>
  );
}

function oddsLine(odds: RallyView['odds']): string {
  return odds.map((o) => `${PRIZE_INFO[o.prize].label.toLowerCase()} ${o.percent}%`).join(', ');
}

const lapLabel = (view: RallyView, lap: number) => (view.laps ? `${Math.min(lap, view.laps)}/${view.laps}` : String(lap));

/** The words for the picture, refreshed twice a second. */
function useRaceLine(view: RallyView, field: RallyField, gameNow: () => number): string {
  useTicker(500);
  const you = view.you;
  if (!you) return 'Watching the race.';
  const me = field.me();
  const team = view.teams && you.team ? view.teams.find((t) => t.name === you.team) : null;
  return raceWords({
    kind: view.kind,
    circuit: view.circuit,
    length: view.length,
    laps: view.laps,
    race: view.race,
    races: view.races,
    now: gameNow(),
    startAt: view.startAt,
    phase: view.phase,
    racers: view.racers,
    you: { d: me?.d ?? you.d, lane: Math.round(me?.srvLane ?? you.lane), place: you.place, lap: you.lap, finished: you.finished, finishMs: you.finishMs, bestLap: you.bestLap, lapStart: you.lapStart, shield: you.shield, boosting: me ? (me.flags & FLAG.boost) !== 0 : Boolean(you.boostUntil), ghost: you.ghost, got: you.got },
    karts: field.list().map((k) => ({ name: k.name || 'A driver', d: k.d, lane: Math.round(k.srvLane), me: k.me, finished: k.finished })),
    items: view.items,
    teamMetres: team?.metres ?? null,
  });
}

function eventSound(e: RallyEventView) {
  switch (e.kind) {
    case 'boost':
    case 'full':
      return 'powerUp' as const;
    case 'puddle':
    case 'cone':
      return 'hurt' as const;
    case 'shield':
      return 'shield' as const;
    case 'lantern':
      return 'coin' as const;
    case 'cough':
      return 'wrong' as const;
    case 'lap':
      return 'levelUp' as const;
    case 'finish':
      return e.place === 1 ? ('win' as const) : ('fanfare' as const);
    case 'up':
      return 'rankUp' as const;
    default:
      return null;
  }
}

/* --------------------------------- player --------------------------------- */

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || Boolean(t.closest('[role="radiogroup"], [role="listbox"], [data-no-move]'));
}

export function LanternRallyPlayer({ view, act, fire, pulse, gameNow, paused, room }: ModeScreenProps<RallyView>) {
  const you = view.you ?? null;
  const meId = room.me.playerId ?? null;
  const field = useField(view, meId, gameNow, pulse);
  const looks = useLooks(room.players);
  const hueOf = useHues(room);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scene = useRef<RallyScene | null>(null);
  const label = useRaceLine(view, field, gameNow);

  // What just happened to your kart: shown, heard and played once each.
  const latest = you?.events.at(-1) ?? null;
  const seen = useRef<number>(latest?.seq ?? 0);
  const [shown, setShown] = useState<RallyEventView | null>(null);
  useEffect(() => {
    if (!you) return;
    const fresh = you.events.filter((e) => e.seq > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1]!.seq;
    // The most telling of the new ones, if several came in one update.
    const rank = (e: RallyEventView) => ['finish', 'lap', 'up', 'down', 'puddle', 'cone', 'shield', 'lantern', 'full', 'boost', 'cough', 'start'].indexOf(e.kind);
    const pick = [...fresh].sort((a, b) => rank(a) - rank(b))[0]!;
    if (pick.kind === 'start') return;
    setShown(pick);
    const s = eventSound(pick);
    if (s) playSfx(s);
  }, [you]);
  const opts = { laps: view.laps, kind: view.kind, circuit: view.circuit };
  useAnnounce(shown ? eventLine(shown, opts) : null, shown?.seq);
  // "Go!" for everyone, in words and sound.
  const [started, setStarted] = useState(() => gameNow() >= view.startAt);
  useEffect(() => {
    const left = view.startAt - gameNow();
    if (left <= 0) {
      setStarted(true);
      return;
    }
    setStarted(false);
    const t = setTimeout(() => setStarted(true), left);
    return () => clearTimeout(t);
  }, [view.startAt, gameNow]);
  useAnnounce(started && view.phase === 'race' ? 'The lights are out: go!' : null, started ? `go${view.startAt}` : null);
  useSfx(started ? 'go' : 'countdown', `${view.startAt}|${started ? 'go' : 'grid'}`, view.phase === 'race');

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.setItems(view.items.map(([at, lane, kind]) => ({ at, lane, kind: kind as 0 | 1 | 2 })));
    s.setStart(view.startAt);
    if (you) {
      s.setGot(you.got);
      s.setGhost(you.ghost, you.lapStart);
    }
  }, [view, you]);

  const steer = useCallback(
    (dir: -1 | 1) => {
      if (!you || paused || view.phase !== 'race' || you.finished !== null) return;
      playSfx('tap');
      fire({ type: 'steer', dir });
    },
    [you, paused, view.phase, fire],
  );
  const boost = useCallback(async () => {
    if (!you || paused) return;
    setBusy(true);
    const ack = await act({ type: 'boost' });
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
  }, [you, paused, act]);
  // The arrow keys steer and B boosts, unless you are typing an answer.
  const keys = useRef({ steer, boost });
  keys.current = { steer, boost };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        keys.current.steer(e.code === 'ArrowLeft' ? -1 : 1);
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        void keys.current.boost();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  if (!you) return <p className="font-semibold text-text-2">Watching the race.</p>;

  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const toggleAuto = async () => {
    playSfx('select');
    const ack = await act({ type: 'auto', on: !you.auto });
    setNote(ack.ok ? null : ack.error.message);
  };
  const now = gameNow();
  const live = view.phase === 'race' && you.finished === null;
  const canBoost = live && now >= view.startAt && you.charges > 0;
  const trial = view.kind === 'trial';
  const sceneKey = `${view.circuit}|${view.race}`;
  const circuit = CIRCUITS[view.circuit];

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="Your race">
        <div className="relative">
          <Stage3D<RallyScene>
            key={sceneKey}
            label={label}
            create={(env) => new RallyScene(env, field, { circuit: view.circuit, me: meId, trial, looks, hueOf })}
            onWorld={(w) => {
              scene.current = w;
              if (w) {
                w.setItems(view.items.map(([at, lane, kind]) => ({ at, lane, kind: kind as 0 | 1 | 2 })));
                w.setStart(view.startAt);
                w.setGot(you.got);
                w.setGhost(you.ghost, you.lapStart);
              }
            }}
            className="h-[36vh] min-h-[230px] rounded-[var(--radius-l)] sm:h-[42vh] lg:h-[56vh]"
            fallback={<RallyMap field={field} circuit={view.circuit} items={view.items} got={you.got} label={label} hueOf={hueOf} trial={trial ? { ghost: you.ghost, lapStart: you.lapStart } : null} gameNow={gameNow} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            {trial ? (
              <Stat label="Best lap" value={you.bestLap !== null ? timeText(you.bestLap) : 'none yet'} icon={Timer} tone="gold" />
            ) : (
              <Stat label="Place" value={`${ordinal(you.place)}/${view.racers}`} icon={Medal} tone="gold" />
            )}
            <Stat label="Lap" value={lapLabel(view, you.lap)} icon={Flag} />
            <Stat label="Points" value={formatNumber(you.points)} icon={Trophy} />
          </div>
          {view.phase === 'race' ? <Lights startAt={view.startAt} gameNow={gameNow} /> : null}
        </div>
        {view.phase === 'break' ? (
          <StagePanel className="flex items-center gap-3 border-lantern/70 px-4 py-3">
            <Flag className="size-7 shrink-0 text-lantern" aria-hidden />
            <p className="font-bold">
              Race {view.race} of {view.races} is over. Next: {CIRCUITS[nextCircuit(view)].name} in <Countdown until={view.breakUntil} gameNow={gameNow} />. Answer now to start with charges.
            </p>
          </StagePanel>
        ) : you.finished !== null ? (
          <StagePanel className="flex items-center gap-3 border-lantern/70 px-4 py-3">
            <Flag className="size-7 shrink-0 text-lantern" aria-hidden />
            <p className="font-bold">
              You finished {ordinal(you.finished)}
              {you.finishMs !== null ? ` in ${timeText(you.finishMs)}` : ''}! Keep answering while the others finish.
            </p>
          </StagePanel>
        ) : (
          <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-2">
            <Button size="xl" onClick={() => steer(-1)} disabled={paused || you.lane <= 0} className="px-2">
              <ArrowLeft className="size-6" aria-hidden />
              <span className="sr-only">Steer left</span>
              <span aria-hidden className="hidden sm:inline">
                Left
              </span>
            </Button>
            <Button size="xl" variant="primary" onClick={() => void boost()} disabled={busy || paused || !canBoost} className="px-2">
              <Zap className="size-6" aria-hidden /> Boost
              <span className="ml-1 rounded-full bg-black/20 px-2 font-display text-base tabular">{you.charges}</span>
              <span className="sr-only">: 3 seconds of extra speed. You have {you.charges} of {you.maxCharges} charges.</span>
            </Button>
            <Button size="xl" onClick={() => steer(1)} disabled={paused || you.lane >= 2} className="px-2">
              <span aria-hidden className="hidden sm:inline">
                Right
              </span>
              <span className="sr-only">Steer right</span>
              <ArrowRight className="size-6" aria-hidden />
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-2">
          <Button size="sm" variant={you.auto ? 'success' : 'secondary'} aria-pressed={you.auto} onClick={() => void toggleAuto()} disabled={paused}>
            <Bot className="size-4" aria-hidden /> Auto-steer: {you.auto ? 'on' : 'off'}
          </Button>
          <span className="inline-flex items-center gap-2 font-semibold text-text">
            <ChargePips charges={you.charges} max={you.maxCharges} /> {you.charges} of {you.maxCharges} charges
          </span>
          {you.shield ? (
            <span className="inline-flex items-center gap-1 font-semibold text-glim">
              <ShieldCheck className="size-4" aria-hidden /> Shield up
            </span>
          ) : null}
          {you.slip ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Gauge className="size-4" aria-hidden /> Slipstream
            </span>
          ) : null}
          <span>Lanterns give: {oddsLine(view.odds)}.</span>
          <span className="hidden sm:inline">Keys: left and right arrows steer, B boosts.</span>
        </div>
        {you.auto ? <p className="text-sm text-text-2">Auto-steer is driving: it steers round hazards, picks up some lanterns and spends your charges. Steering yourself turns it off.</p> : null}
        {shown ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${shown.kind === 'puddle' || shown.kind === 'cone' || shown.kind === 'cough' ? 'border-ember/60' : shown.kind === 'finish' || shown.kind === 'lap' || shown.kind === 'up' ? 'border-lantern/70' : ''}`}>
            {shown.kind === 'boost' || shown.kind === 'full' ? <Zap className="size-7 shrink-0 text-lantern" aria-hidden /> : shown.kind === 'shield' ? <ShieldCheck className="size-7 shrink-0 text-glim" aria-hidden /> : <Flag className="size-7 shrink-0 text-lantern" aria-hidden />}
            <p className="font-bold">{eventLine(shown, opts)}</p>
          </StagePanel>
        ) : null}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
        <p className="sr-only">{circuit.blurb}</p>
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions">
        <p className="text-sm font-semibold text-text-2">
          {you.team ? `You drive for ${you.team}. ` : ''}Right answers give boost charges; a wrong one makes your engine cough. {you.answers < you.answerCap ? `Each right answer scores ${POINTS.answer} points (${you.answers} of ${you.answerCap} so far).` : `You have scored all ${you.answerCap} answer bonuses this race.`}
        </p>
        {you.last && !you.last.correct ? (
          <div className="flex flex-col gap-2">
            <ResultBanner key={you.last.iid} correct={false} partial={you.last.partial} text={you.last.text} />
            <Explanation text={you.last.explanation} />
          </div>
        ) : you.last?.correct ? (
          <ResultBanner key={you.last.iid} correct text={you.last.text} />
        ) : null}
        {you.question ? (
          <>
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
          </>
        ) : you.steadyUntil ? (
          <StagePanel className="px-4 py-3">
            <p className="font-bold">Your engine is coughing. The next question comes in a moment.</p>
          </StagePanel>
        ) : null}
      </section>
    </div>
  );
}

function nextCircuit(view: RallyView): CircuitId {
  const ids = Object.keys(CIRCUITS) as CircuitId[];
  return ids[(ids.indexOf(view.circuit) + 1) % ids.length]!;
}

/* ---------------------------------- host ---------------------------------- */

function newsLine(n: News): string {
  switch (n.kind) {
    case 'lead':
      return `${n.name} takes the lead from ${n.other ?? 'the leader'}!`;
    case 'pass':
      return `${n.name} passes ${n.other ?? 'a rival'} for ${ordinal(n.place)}!`;
    case 'finish':
      return `${n.name} crosses the line ${n.place === 1 ? 'first' : ordinal(n.place)}${n.ms !== null ? ` in ${timeText(n.ms)}` : ''}.`;
    case 'final':
      return `Final lap for ${n.name}, in the lead!`;
    case 'best':
      return `Fastest lap: ${n.name}, ${timeText(n.ms ?? 0)}.`;
  }
}

function rowDetail(view: RallyView, r: BoardRow): string {
  if (view.kind === 'trial') return r.bestLap !== null ? timeText(r.bestLap) : `lap ${r.lap}`;
  if (view.kind === 'relay') return `${formatNumber(r.metres)} m`;
  if (r.finished !== null) return r.finishMs !== null ? timeText(r.finishMs) : 'finished';
  return view.laps ? `lap ${Math.min(r.lap, view.laps)}/${view.laps}` : `lap ${r.lap}`;
}

function Board({ view, rows, players }: { view: RallyView; rows: BoardRow[]; players: number }) {
  const gp = view.kind === 'gp';
  const title = view.kind === 'trial' ? 'Best laps' : view.kind === 'relay' ? 'Furthest' : gp && view.phase === 'break' ? 'Grand Prix points' : 'Race order';
  const list = gp && view.phase === 'break' ? [...rows].sort((a, b) => b.points - a.points) : rows;
  return (
    <StagePanel className="flex flex-col gap-2 p-3" as="aside" label={title}>
      <h3 className="flex items-center justify-between gap-2 font-display text-xl font-extrabold">
        {title}
        <span className="text-base font-bold text-text-2 tabular">{players} racing</span>
      </h3>
      <ol className="flex flex-col gap-1">
        {list.slice(0, 8).map((r, i) => (
          <li key={r.playerId} className={`flex items-center gap-2 rounded-[var(--radius-m)] px-2 py-1 text-lg transition-transform ${i === 0 ? 'bg-lantern/20' : ''}`}>
            <span className="w-9 shrink-0 font-display font-extrabold tabular">{ordinal(gp && view.phase === 'break' ? i + 1 : r.place)}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
            <span className="shrink-0 font-display font-bold text-text-2 tabular">{gp ? `${formatNumber(r.points)} pts` : rowDetail(view, r)}</span>
          </li>
        ))}
      </ol>
    </StagePanel>
  );
}

export function LanternRallyHost({ view, pulse, gameNow, room }: ModeScreenProps<RallyView>) {
  const field = useField(view, null, gameNow, pulse);
  const looks = useLooks(room.players);
  const hueOf = useHues(room);
  const scene = useRef<RallyHostScene | null>(null);
  const [threeD, setThreeD] = useState(false);
  const topNews = view.news?.[0];
  useSfx(topNews?.kind === 'finish' ? (topNews.place === 1 ? 'win' : 'fanfare') : topNews?.kind === 'best' ? 'levelUp' : 'rankUp', topNews?.id ?? null, Boolean(topNews));
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.setItems(view.items.map(([at, lane, kind]) => ({ at, lane, kind: kind as 0 | 1 | 2 })));
    s.setStart(view.startAt);
  }, [view]);
  // Cut to an overtake or a new leader as it happens.
  const cutFor = useRef(topNews?.id ?? 0);
  useEffect(() => {
    if (!topNews || topNews.id === cutFor.current) return;
    cutFor.current = topNews.id;
    if (topNews.kind !== 'pass' && topNews.kind !== 'lead') return;
    scene.current?.cutTo(topNews.playerId);
  }, [topNews]);
  // The table reorders at most every 2 seconds: each move slides once, then reads in order.
  const rows = useSteady(view.board, 2000);
  const circuit = CIRCUITS[view.circuit];
  const leader = view.board[0];
  const label = `${circuit.name}: ${view.racers} ${view.racers === 1 ? 'kart' : 'karts'}${view.laps ? `, ${view.laps} ${view.laps === 1 ? 'lap' : 'laps'}` : ''}. ${leader ? (view.kind === 'trial' ? `${leader.name} has the best lap.` : `${leader.name} leads.`) : ''} ${view.finished ? `${view.finished} finished.` : ''}`.trim();
  const title = view.kind === 'gp' ? `Grand Prix: race ${view.race} of ${view.races}` : view.kind === 'trial' ? 'Time trial' : view.kind === 'relay' ? 'Team relay' : view.laps ? `${view.laps} ${view.laps === 1 ? 'lap' : 'laps'}` : '';
  const sceneKey = `${view.circuit}|${view.race}`;

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Lantern Rally</ModeTitle>
          <p className="font-semibold text-text-2">
            {circuit.name}. {title}. Right answers are boost charges: steer for lanterns, round puddles and cones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.laps && leader ? (
            <Pill tone="lantern" className="px-5 py-1.5">
              <Flag className="size-[1em]" aria-hidden /> {leader.finished ? 'Finished' : `Lap ${Math.min(leader.lap, view.laps)} of ${view.laps}`}
            </Pill>
          ) : null}
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.phase === 'break' ? view.breakUntil : view.endsAt} gameNow={gameNow} label={view.phase === 'break' ? 'Next race in' : view.whistleAt ? 'Whistle in' : 'Time left'} />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="relative min-h-[52vh]">
          <Stage3D<RallyHostScene>
            key={sceneKey}
            label={label}
            create={(env) => new RallyHostScene(env, field, { circuit: view.circuit, trial: view.kind === 'trial', looks, hueOf })}
            onWorld={(w) => {
              scene.current = w;
              setThreeD(Boolean(w));
              if (w) {
                w.setItems(view.items.map(([at, lane, kind]) => ({ at, lane, kind: kind as 0 | 1 | 2 })));
                w.setStart(view.startAt);
              }
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<RallyMap field={field} circuit={view.circuit} items={view.items} label={label} host hueOf={hueOf} gameNow={gameNow} />}
          />
          {view.phase === 'race' ? <Lights startAt={view.startAt} gameNow={gameNow} /> : null}
          {threeD ? (
            <div className="pointer-events-none absolute bottom-3 left-3 h-[22%] w-[22%] min-w-[9rem] overflow-hidden rounded-[var(--radius-m)] border border-white/20 bg-black/40" aria-hidden>
              <RallyMap field={field} circuit={view.circuit} items={view.items} label="" mini hueOf={hueOf} gameNow={gameNow} />
            </div>
          ) : null}
          {view.news?.length ? (
            <ul className="absolute right-3 bottom-3 flex max-w-[min(30rem,60%)] flex-col items-end gap-1.5" aria-label="Race news">
              {view.news.slice(0, 2).map((n) => (
                <li key={n.id} className={`rounded-[var(--radius-m)] px-3 py-1.5 font-bold backdrop-blur-sm ${n.kind === 'finish' && n.place === 1 ? 'bg-lantern text-on-accent' : n.kind === 'lead' || n.kind === 'pass' ? 'bg-glim text-on-accent' : 'bg-black/60 text-white'}`}>
                  {newsLine(n)}
                </li>
              ))}
            </ul>
          ) : null}
          {view.phase === 'break' ? (
            <div className="absolute inset-x-3 top-3 flex justify-center">
              <StagePanel className="px-5 py-3 text-center">
                <p className="font-display text-2xl font-extrabold">
                  Next: {CIRCUITS[nextCircuit(view)].name} in <Countdown until={view.breakUntil} gameNow={gameNow} />
                </p>
              </StagePanel>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          {view.teams ? (
            <StagePanel className="flex flex-col gap-2 p-3" as="section" label="Teams">
              <h3 className="font-display text-xl font-extrabold">{view.kind === 'relay' ? 'Team distance' : 'Teams'}</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.score, members: t.members }))} format={view.kind === 'relay' ? (n) => `${formatNumber(n)} m` : formatNumber} />
            </StagePanel>
          ) : null}
          <Board view={view} rows={rows} players={view.racers} />
          {view.fastest ? (
            <p className="flex items-center gap-2 px-1 text-lg font-semibold text-text-2">
              <Timer className="size-5 text-lantern" aria-hidden /> Fastest lap: {view.fastest.name}, {timeText(view.fastest.ms)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
