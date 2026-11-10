import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, ChevronsUp, Flag, Hand, Mountain, Sparkles, Trophy, Wind, type LucideIcon } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import { LEAP_CHANCE, type LeapOdds } from '@ludora/engine/summit-scramble';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { Button } from '../../../ui/Button.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx, useSfx } from '../../../lib/sound/react.tsx';
import { Stage3D, lookFor } from '../../../three/index.ts';
import { SummitHostScene, SummitScene, type MoveKind, type SceneClimber, type SceneState } from './summit-scene.ts';
import { SideView } from './summit-side.tsx';

/*
 * Summit Scramble screens. The 3D mountain is the picture; everything you do
 * is an ordinary button beside it: Climb, Leap, Throw rope, and the question.
 * With 3D off, a drawn side view of the same mountain stands in for it.
 */

/* ---------------------------------- types --------------------------------- */

interface Move {
  seq: number;
  at: number;
  kind: MoveKind;
  from: number;
  to: number;
  by: string;
  other: string | null;
  chance: number | null;
  camp: { ledge: number; order: number; bonus: number } | null;
  summit: number | null;
  rope: boolean;
}

export interface ClimberView {
  playerId: string;
  name: string;
  teamId: string | null;
  ledge: number;
  seq: number;
  kind: MoveKind | null;
  finished: number | null;
  rope: boolean;
  isYou: boolean;
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  ledge: number;
  points: number;
  finished: number | null;
  rank: number;
  isYou: boolean;
}

interface You {
  ledge: number;
  camp: number;
  nextCamp: number;
  grip: number;
  maxGrip: number;
  rope: boolean;
  ropeTarget: string | null;
  steadyUntil: number | null;
  finished: number | null;
  points: number;
  rank: number | null;
  team: string | null;
  streak: number;
  bonusEvery: number;
  climb: { cost: number; gain: number };
  leap: LeapOdds | null;
  move: Move | null;
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
}

interface News {
  id: number;
  at: number;
  kind: 'camp' | 'summit' | 'rope';
  name: string;
  other: string | null;
  ledge: number;
  order: number;
}

export interface SummitView {
  endsAt: number;
  summit: number;
  camps: { ledge: number; first: string[] }[];
  rules: { leaps: boolean; ropes: boolean; roped: boolean; night: boolean; sight: number };
  wind: { startsAt: number; endsAt: number; blowing: boolean } | null;
  finishers: number;
  finished: string[];
  players: number;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; score: number; ledge: number }[] | null;
  ropes: number[];
  climbers: ClimberView[];
  you?: You | null;
  news?: News[];
  race?: { ledge: number; summit: boolean; leaders: { name: string; ledge: number; togo: number }[] };
}

/* --------------------------------- helpers -------------------------------- */

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const placeName = (ledge: number, summit: number) => (ledge >= summit ? 'the summit' : ledge === 0 ? 'the foot of the mountain' : ledge % 10 === 0 ? `Camp ${ledge / 10}` : `ledge ${ledge}`);
const campName = (ledge: number, summit: number) => (ledge >= summit ? 'the summit' : `Camp ${ledge / 10}`);
const tens = (p: number) => `${Math.round(p / 10)} times in 10`;
const ledges = (n: number) => `${n} ${n === 1 ? 'ledge' : 'ledges'}`;

function moveLine(m: Move, summit: number): string {
  let line: string;
  switch (m.kind) {
    case 'climb':
      line = `You climbed to ${placeName(m.to, summit)}.`;
      break;
    case 'leap':
      line = `Leap! Up ${ledges(m.to - m.from)} to ${placeName(m.to, summit)}.`;
      break;
    case 'slip':
      line = m.to === m.from ? `The leap slipped, but you held on at ${placeName(m.to, summit)}.` : `The leap slipped: you slid back to ${placeName(m.to, summit)}.`;
      break;
    case 'pull':
      line = `You threw your rope to ${m.other ?? 'the climber below'} and pulled them up.`;
      break;
    case 'pulled':
      line = `${m.other ?? 'Someone'} threw you a rope: up ${ledges(m.to - m.from)} to ${placeName(m.to, summit)}.`;
      break;
  }
  if (m.summit) line += ` You reached the summit ${m.summit === 1 ? 'first' : `in ${ordinal(m.summit)} place`}!`;
  else if (m.camp) line += ` ${campName(m.camp.ledge, summit)} reached${m.camp.order <= 3 ? `, ${ordinal(m.camp.order)} there: +${m.camp.bonus} points` : ''}.`;
  if (m.rope) line += ' You picked up a rope.';
  return line;
}

function moveSound(m: Move) {
  if (m.summit) return 'win' as const;
  if (m.camp) return 'rankUp' as const;
  if (m.kind === 'slip') return 'hurt' as const;
  if (m.kind === 'leap') return 'levelUp' as const;
  if (m.kind === 'pulled') return 'shield' as const;
  if (m.kind === 'pull') return 'swap' as const;
  return 'step' as const;
}

/** How long the 3D move takes, so the words wait for the picture. */
const MOVE_MS: Record<MoveKind, number> = { climb: 550, leap: 1150, slip: 1450, pull: 200, pulled: 1200 };

function useMoveFlow(move: Move | null | undefined, threeD: boolean) {
  const [shown, setShown] = useState<Move | null>(null);
  // A move already made when the screen opened (a reload) is not news.
  const seen = useRef<number>(move?.seq ?? 0);
  useEffect(() => {
    if (!move || move.seq === seen.current) return;
    seen.current = move.seq;
    const t = setTimeout(
      () => {
        setShown(move);
        playSfx(moveSound(move));
      },
      threeD ? MOVE_MS[move.kind] : 0,
    );
    return () => clearTimeout(t);
  }, [move, threeD]);
  return shown;
}

function windLine(w: NonNullable<SummitView['wind']>): string {
  return w.blowing ? `The wind is blowing: leaps work only ${tens(LEAP_CHANCE.wind)}.` : `The wind is picking up: soon leaps will work only ${tens(LEAP_CHANCE.wind)}.`;
}

function sceneState(view: SummitView, looks: (id: string) => SceneClimber['look']): SceneState {
  return {
    summit: view.summit,
    climbers: view.climbers.map((c) => ({ playerId: c.playerId, name: c.name, ledge: c.ledge, seq: c.seq, kind: c.kind, finished: c.finished, isYou: c.isYou, look: looks(c.playerId) })),
    ropes: view.ropes,
    wind: view.wind ? view.wind.blowing : null,
    reached: view.camps.filter((c) => c.first.length).map((c) => c.ledge),
  };
}

function useLooks(room: ModeScreenProps['room']) {
  return useCallback((id: string) => lookFor(room.players.find((p) => p.id === id)?.avatar, fallbackArt(id)), [room.players]);
}

/** The words that stand for the picture, for screen readers. */
function describe(view: SummitView, you: You): string {
  const where = you.finished ? `You are at the summit, ${ordinal(you.finished)} to get there.` : you.ledge === 0 ? `You are at the foot of the mountain, ${view.summit} ledges below the summit.` : you.ledge % 10 === 0 ? `You are at Camp ${you.ledge / 10}, ledge ${you.ledge} of ${view.summit}.` : `You are on ledge ${you.ledge} of ${view.summit}.`;
  const camp = you.finished ? '' : you.camp > 0 && you.ledge !== you.camp ? ` Your last camp is Camp ${you.camp / 10}, ${ledges(you.ledge - you.camp)} below.` : '';
  const next = you.finished ? '' : ` ${campName(you.nextCamp, view.summit)} is ${ledges(you.nextCamp - you.ledge)} up.`;
  const near = view.climbers.filter((c) => !c.isYou);
  const above = near.filter((c) => c.ledge > you.ledge).sort((a, b) => a.ledge - b.ledge)[0];
  const below = near.filter((c) => c.ledge < you.ledge).sort((a, b) => b.ledge - a.ledge)[0];
  const others = `${above ? ` ${above.name} is just above you on ${placeName(above.ledge, view.summit)}.` : ''}${below ? ` ${below.name} is just below you.` : ''}`;
  const rope = view.ropes.filter((l) => l > you.ledge).sort((a, b) => a - b)[0];
  const ropeLine = rope !== undefined && !you.finished ? ` The next rope hangs on ledge ${rope}.` : '';
  const wind = view.wind ? ` ${windLine(view.wind)}` : '';
  return `${where}${camp}${next}${others}${ropeLine}${wind}`;
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

/* ---------------------------------- parts --------------------------------- */

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

function WindPill({ wind, gameNow, big = false }: { wind: NonNullable<SummitView['wind']>; gameNow: () => number; big?: boolean }) {
  return (
    <Pill tone={wind.blowing ? 'ember' : 'lantern'} className={big ? 'px-4 py-1.5 text-[clamp(1rem,1.5vw,1.5rem)]' : 'px-3 py-1 text-sm'}>
      <Wind className={big ? 'size-6' : 'size-4'} aria-hidden />
      {wind.blowing ? (
        <>
          Wind: leaps {Math.round(LEAP_CHANCE.wind / 10)} in 10 for <Countdown until={wind.endsAt} gameNow={gameNow} />
        </>
      ) : (
        <>
          Wind in <Countdown until={wind.startsAt} gameNow={gameNow} />: leaps will be {Math.round(LEAP_CHANCE.wind / 10)} in 10
        </>
      )}
    </Pill>
  );
}

/** Grip as pips: how much you hold of the most you can. */
function GripPips({ grip, max }: { grip: number; max: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`inline-block size-2.5 rounded-full ${i < grip ? 'bg-lantern' : 'bg-white/20'}`} />
      ))}
    </span>
  );
}

/* --------------------------------- player --------------------------------- */

export function SummitScramblePlayer({ view, act, gameNow, paused, room }: ModeScreenProps<SummitView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [threeD, setThreeD] = useState(true);
  const scene = useRef<SummitScene | null>(null);
  const looks = useLooks(room);
  const me = room.me.playerId ?? 'me';
  const shown = useMoveFlow(you?.move, threeD);
  const windKey = view.wind ? `${view.wind.startsAt}|${view.wind.blowing ? 'blow' : 'warn'}` : null;
  useAnnounce(view.wind ? windLine(view.wind) : null, windKey);
  useSfx(view.wind?.blowing ? 'event' : 'alarm', windKey, view.wind !== null);
  useAnnounce(shown ? moveLine(shown, view.summit) : null, shown?.seq);

  const state = useMemo(() => sceneState(view, looks), [view, looks]);
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  const onWorld = useCallback(
    (w: SummitScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w) w.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!you) return <p className="font-semibold text-text-2">Watching the climb.</p>;

  const send = async (a: unknown) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
    return ack.ok;
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const left = view.endsAt - gameNow();
  const done = you.finished !== null;
  const leap = you.leap;
  const label = describe(view, you);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="Your climb">
        <div className="relative">
          <Stage3D<SummitScene>
            label={label}
            create={(env) => new SummitScene(env, { night: view.rules.night, summit: view.summit, me })}
            onWorld={onWorld}
            className="h-[36vh] min-h-[230px] rounded-[var(--radius-l)] sm:h-[42vh] lg:h-[60vh]"
            fallback={<SideView view={view} label={label} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label="Ledge" value={`${you.ledge}/${view.summit}`} icon={Mountain} tone="gold" />
            <Stat label="Grip" value={`${you.grip}/${you.maxGrip}`} icon={Hand} />
            <Stat label="Points" value={formatNumber(you.points)} icon={Trophy} />
          </div>
          {view.wind ? (
            <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)]" aria-hidden>
              <WindPill wind={view.wind} gameNow={gameNow} />
            </div>
          ) : null}
        </div>
        {done ? (
          <StagePanel className="flex items-center gap-3 border-lantern/70 px-4 py-3">
            <Flag className="size-7 shrink-0 text-lantern" aria-hidden />
            <p className="font-bold">
              You reached the summit, {ordinal(you.finished!)}! Keep answering while the others climb{you.rope ? '.' : '.'}
            </p>
          </StagePanel>
        ) : (
          <div className={`grid gap-2 ${you.rope ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
            <Button size="lg" variant="primary" onClick={() => (playSfx('tap'), void send({ type: 'climb' }))} disabled={busy || paused || you.grip < you.climb.cost}>
              <ArrowUp className="size-5" aria-hidden /> Climb
              <span className="ml-1 rounded-full bg-black/20 px-2 font-display text-base tabular">{you.climb.cost} grip</span>
              <span className="sr-only">: up one ledge, always works. You have {you.grip} grip.</span>
            </Button>
            {leap ? (
              <Button
                size="lg"
                variant="secondary"
                onClick={() => (playSfx('powerUp'), void send({ type: 'leap' }))}
                disabled={busy || paused || you.grip < leap.cost}
              >
                <ChevronsUp className="size-5" aria-hidden /> Leap
                <span className={`ml-1 rounded-full px-2 font-display text-base tabular ${leap.chance < LEAP_CHANCE.calm ? 'bg-ember text-on-accent' : 'bg-black/20'}`}>{leap.chance}%</span>
                <span className="sr-only">
                  : up {leap.gain} ledges for {leap.cost} grip. Works {tens(leap.chance)}; if it fails you slide back to {placeName(leap.fall, view.summit)}.
                </span>
              </Button>
            ) : null}
            {you.rope ? (
              <Button
                size="lg"
                variant="secondary"
                className="col-span-2 sm:col-span-1"
                onClick={() => (playSfx('swap'), void send({ type: 'rope' }))}
                disabled={busy || paused || !you.ropeTarget}
              >
                <Sparkles className="size-5" aria-hidden /> {you.ropeTarget ? `Rope to ${you.ropeTarget}` : 'Rope: nobody below'}
                <span className="sr-only">{you.ropeTarget ? `: throw it down and ${you.ropeTarget}, the nearest climber below you, comes up 2 ledges. You both score.` : ': you hold a rope; throw it when someone is below you.'}</span>
              </Button>
            ) : null}
          </div>
        )}
        {!done ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-2">
            <span className="inline-flex items-center gap-2 font-semibold text-text">
              <GripPips grip={you.grip} max={you.maxGrip} /> {you.grip} grip
            </span>
            {leap ? (
              <span>
                Leap: {leap.chance}% to land on {placeName(leap.land, view.summit)}, {100 - leap.chance}% to slide to {placeName(leap.fall, view.summit)}. On average a leap gains {leap.average} ledges; two climbs gain 2{leap.average > 2 ? ', so leaping is the better bet now' : leap.average < 2 ? ', so climbing is the better bet now' : ''}.
              </span>
            ) : null}
            <span>
              {campName(you.nextCamp, view.summit)}: {ledges(you.nextCamp - you.ledge)} up.
            </span>
            {left < 30_000 ? <span className="font-bold text-ember">Last 30 seconds!</span> : null}
          </div>
        ) : null}
        {shown ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${shown.kind === 'slip' ? 'border-ember/60' : shown.camp || shown.summit ? 'border-lantern/70' : ''}`}>
            {shown.kind === 'slip' ? <Wind className="size-7 shrink-0 text-ember" aria-hidden /> : shown.summit || shown.camp ? <Flag className="size-7 shrink-0 text-lantern" aria-hidden /> : <ArrowUp className="size-7 shrink-0 text-lantern" aria-hidden />}
            <p className="font-bold">{moveLine(shown, view.summit)}</p>
          </StagePanel>
        ) : null}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions">
        <p className="text-sm font-semibold text-text-2">
          {you.team ? `${you.team} climbs as one: your right answers add to the team's grip. ` : ''}Right answers give grip. {you.streak > 0 ? `${you.streak} in a row: a bonus grip every ${you.bonusEvery}.` : `${you.bonusEvery} in a row earns a bonus grip.`}
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
            <p className="font-bold">Your Glim is catching its balance. The next question comes in a moment.</p>
          </StagePanel>
        ) : null}
      </section>
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

function newsLine(n: News, summit: number): string {
  switch (n.kind) {
    case 'camp':
      return `${n.name} reached ${campName(n.ledge, summit)} ${n.order === 1 ? 'first' : ordinal(n.order)}.`;
    case 'summit':
      return `${n.name} reached the summit ${n.order === 1 ? 'first' : `in ${ordinal(n.order)} place`}!`;
    case 'rope':
      return `${n.name} threw a rope to ${n.other ?? 'a climber'}.`;
  }
}

export function SummitScrambleHost({ view, gameNow, room }: ModeScreenProps<SummitView>) {
  const scene = useRef<SummitHostScene | null>(null);
  const looks = useLooks(room);
  const state = useMemo(() => sceneState(view, looks), [view, looks]);
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  const windKey = view.wind ? `${view.wind.startsAt}|${view.wind.blowing ? 'blow' : 'warn'}` : null;
  useSfx(view.wind?.blowing ? 'event' : 'alarm', windKey, view.wind !== null);
  const topNews = view.news?.[0];
  useSfx(topNews?.kind === 'summit' ? 'win' : topNews?.kind === 'rope' ? 'shield' : 'rankUp', topNews?.id ?? null, Boolean(topNews));
  // Room for the race above the board on a school laptop's screen. The board moves at most every
  // 2.5 seconds: each reorder slides for under half a second, so between moves it reads in order.
  const steadyBoard = useSteady(view.board, 2500);
  const rows = steadyBoard.slice(0, 5).map((r) => ({ playerId: r.playerId, name: r.name, score: r.points, rank: r.rank, teamId: r.teamId }));
  const race = view.race;
  const label = `The mountain: ${view.players} climbers. ${view.finished.length ? `${view.finished.length} at the summit.` : ''} ${race?.leaders[0] ? `${race.leaders[0].name} leads the race to ${campName(race.ledge, view.summit)}.` : ''}`;

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Summit Scramble</ModeTitle>
          <p className="font-semibold text-text-2">Right answers give grip. Climb, leap, and throw ropes to the climbers below.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          <Pill tone="lantern" className="px-5 py-1.5">
            <Flag className="size-[1em]" aria-hidden /> {view.finished.length} of {view.finishers} at the summit
          </Pill>
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="relative min-h-[52vh]">
          <Stage3D<SummitHostScene>
            label={label}
            create={(env) => new SummitHostScene(env, { night: view.rules.night, summit: view.summit })}
            onWorld={(w) => {
              scene.current = w;
              w?.setState(state);
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<SideView view={view} label={label} host />}
          />
          {view.wind ? (
            <div className="absolute top-3 left-3" role="status">
              <WindPill wind={view.wind} gameNow={gameNow} big />
            </div>
          ) : null}
          {view.news?.length ? (
            <ul className="absolute right-3 bottom-3 flex max-w-[min(30rem,60%)] flex-col items-end gap-1.5" aria-label="Mountain news">
              {view.news.slice(0, 2).map((n) => (
                <li key={n.id} className={`rounded-[var(--radius-m)] px-3 py-1.5 font-bold backdrop-blur-sm ${n.kind === 'summit' ? 'bg-lantern text-on-accent' : 'bg-black/60 text-white'}`}>
                  {newsLine(n, view.summit)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          {race && race.leaders.length ? (
            <StagePanel className="flex flex-col gap-2 p-3" as="section" label={`Race to ${campName(race.ledge, view.summit)}`}>
              <h3 className="flex items-center gap-2 font-display text-xl font-extrabold">
                <Flag className="size-5 text-lantern" aria-hidden /> Race to {campName(race.ledge, view.summit)}
              </h3>
              <ol className="flex flex-col gap-1">
                {race.leaders.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="flex items-center justify-between gap-2 text-lg">
                    <span className="min-w-0 truncate font-bold">{l.name}</span>
                    <span className="shrink-0 font-display font-bold text-text-2 tabular">{l.togo} to go</span>
                  </li>
                ))}
              </ol>
            </StagePanel>
          ) : null}
          <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Most points">
            <h3 className="font-display text-xl font-extrabold">Most points</h3>
            {view.teams ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.score, members: t.members }))} /> : null}
            <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense />
          </StagePanel>
        </div>
      </div>
    </div>
  );
}
