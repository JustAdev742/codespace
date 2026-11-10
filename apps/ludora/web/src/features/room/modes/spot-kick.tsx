import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Hand, ShieldCheck, Timer, Trophy } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import { AIMS, AIM_INFO, POWER_INFO, type Aim, type Outcome, type Power, type ShotOdds } from '@ludora/engine/spot-kick';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { useNow } from '../../../lib/useNow.ts';
import { playSfx, useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import { Stage3D, lookFor, storedChoice, webglSupported, type GlimLook } from '../../../three/index.ts';
import { SpotKickReelScene, SpotKickScene, type KickShot, type ReelShot, type ShotHow } from './spot-kick-scene.ts';
import { GoalMouth } from './spot-kick-goal.tsx';

/*
 * Spot Kick screens. The floodlit stadium is the picture; everything you do
 * is an ordinary button beside it: two strengths, and five places laid out
 * like a goal, each with its chances written on it. With 3D off a drawn goal
 * mouth shows the same shot. What happened to each shot is said in words.
 */

/* ---------------------------------- types --------------------------------- */

interface Shot extends KickShot {
  at: number;
  streak: number;
  chance: number;
  keeper: string | null;
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  points: number;
  shots: number;
  goals: number;
  onFire: boolean;
  rank: number;
  isYou: boolean;
}

interface TeamRow {
  teamId: string;
  name: string;
  hue: number;
  members: number;
  goals: number;
  average: number;
  score: number;
}

interface You {
  points: number;
  balls: number;
  maxBalls: number;
  shots: number;
  goals: number;
  saved: number;
  wide: number;
  streak: number;
  fireStreak: number;
  onFire: boolean;
  canShoot: boolean;
  rank: number | null;
  reads: Record<Aim, number>;
  readMax: number;
  odds: ShotOdds[];
  lastShot: Shot | null;
  guard: Aim[] | null;
  kept: number;
  foe: { name: string | null; guard: Aim[] } | null;
  notes: { id: number; at: number; text: string; tone: 'good' | 'bad' | 'info' }[];
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
}

interface ReelView extends KickShot {
  id: number;
  at: number;
  name: string;
  by: string;
  teamId: string | null;
  keeper: string | null;
  streak: number;
}

interface SpotKickView {
  endsAt: number;
  golden: { endsAt: number; teams: boolean; leaders: string[] } | null;
  houseMatch: boolean;
  keeperDuty: boolean;
  keeperLearns: boolean;
  players: number;
  board: BoardRow[];
  teams: TeamRow[] | null;
  you?: You | null;
  reel?: ReelView[];
  totals?: { shots: number; goals: number; saved: number; wide: number };
}

/* --------------------------------- words ---------------------------------- */

const place = (a: Aim) => AIM_INFO[a].label.toLowerCase();
const goalsText = (n: number) => `${formatNumber(n)} ${n === 1 ? 'goal' : 'goals'}`;

const MISS_WORDS: Record<ShotHow, string> = {
  over: 'Over the bar.',
  wide: 'Wide of the post.',
  post: 'Off the post!',
  bar: 'Off the crossbar!',
  catch: 'Saved: the keeper held on to it.',
  parry: 'Saved: the keeper pushed it away.',
  tip: 'Saved: tipped over the bar.',
  net: '',
};

/** What happened to a shot, for the result card and screen readers. */
export function shotLine(s: Pick<Shot, 'aim' | 'power' | 'outcome' | 'how' | 'dive' | 'fire' | 'points'>, who: string | null = null): string {
  const power = POWER_INFO[s.power].label;
  const by = who ? `${who}: ` : '';
  if (s.outcome === 'goal') {
    const keeper = s.dive === 'mid' ? 'the keeper stayed in the middle' : `the keeper dived to the ${place(s.dive)}`;
    return `${s.fire ? 'Double goal!' : 'Goal!'} ${by}${power} into the ${place(s.aim)}, and ${keeper}.${s.fire ? ' Two points.' : ''}`;
  }
  return `${MISS_WORDS[s.how]} ${by}${power} shot to the ${place(s.aim)}.`;
}

const outcomeWord = (o: Outcome) => (o === 'goal' ? 'Goal' : o === 'saved' ? 'Saved' : 'Missed');

function shotSound(s: { outcome: Outcome; fire: boolean }) {
  if (s.outcome === 'goal') return s.fire ? ('jackpot' as const) : ('rankUp' as const);
  return s.outcome === 'saved' ? ('shield' as const) : ('wrong' as const);
}

const pct = (n: number) => `${Math.round(n)}%`;

/* ---------------------------------- parts --------------------------------- */

/** Three footballs: the ones you hold, filled. */
function Balls({ n, max }: { n: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${n} of ${max} footballs`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="size-5" aria-hidden>
          <circle cx="10" cy="10" r="8.2" fill={i < n ? '#f7f7fb' : 'transparent'} stroke={i < n ? '#141a3a' : 'rgb(255 255 255 / 0.55)'} strokeWidth="1.6" strokeDasharray={i < n ? undefined : '3 2.4'} />
          {i < n ? <path d="M10 6.2l3 2.2-1.1 3.5H8.1L7 8.4z" fill="#141a3a" /> : null}
        </svg>
      ))}
    </span>
  );
}

/** How well the keeper has learned a place: filled pips out of the most it can learn. */
function Pips({ n, max }: { n: number; max: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-1.5 w-2.5 rounded-full ${i < n ? 'bg-ember' : 'bg-white/20'}`} />
      ))}
    </span>
  );
}

function AimButton({ odds, read, readMax, disabled, onShoot, onHover, className = '' }: { odds: ShotOdds; read: number; readMax: number; disabled: boolean; onShoot: () => void; onHover: (on: boolean) => void; className?: string }) {
  // The name is the visible text with a few words for screen readers in between, so it reads as a sentence:
  // "Shoot top left, placed: 70% goal, saved 30%, wide 0%."
  const tone = odds.goal >= 60 ? 'text-glim' : odds.goal >= 45 ? 'text-lantern' : 'text-ember';
  return (
    <button
      type="button"
      onClick={onShoot}
      disabled={disabled}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`group relative flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-m)] bg-black/45 px-1.5 py-1.5 text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.35)] transition-[transform,background-color] duration-150 hover:bg-black/60 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${odds.guarded ? 'ring-2 ring-lantern ring-inset' : ''} ${className}`}
    >
      <span className="text-xs font-bold text-white/80">
        <span className="sr-only">Shoot </span>
        {AIM_INFO[odds.aim].label}
        <span className="sr-only">, {odds.power}: </span>
      </span>
      <span className={`font-display text-2xl leading-none font-extrabold tabular ${tone}`}>
        {pct(odds.goal)}
        <span className="sr-only"> goal, </span>
      </span>
      <span className="text-[0.7rem] leading-tight text-white/75 tabular">
        saved {pct(odds.saved)}
        {odds.wide ? <span aria-hidden> · </span> : null}
        <span className={odds.wide ? '' : 'sr-only'}>
          <span className="sr-only">, </span>wide {pct(odds.wide)}
        </span>
        <span className="sr-only">.</span>
      </span>
      {read || odds.guarded ? (
        <span className="mt-0.5 flex items-center gap-1">
          {odds.guarded ? <ShieldCheck className="size-3.5 text-lantern" aria-hidden /> : null}
          {read ? <Pips n={read} max={readMax} /> : null}
          <span className="sr-only">
            {read ? ` The keeper has learned this place, ${read} of ${readMax}.` : ''}
            {odds.guarded ? ' The keeper guards this place.' : ''}
          </span>
        </span>
      ) : null}
    </button>
  );
}

/** The strengths in a few words, to fit a phone; the rules say the rest. */
const SHORT_BLURB: Record<Power, string> = { placed: 'Always on target', blasted: 'Harder to save, can go wide' };

/** Two strengths, as a pair of toggle buttons. */
function PowerPicker({ power, onPick }: { power: Power; onPick: (p: Power) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-m)] bg-white/[0.08] p-1" role="group" aria-label="How hard">
      {(['placed', 'blasted'] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={power === p}
          onClick={() => onPick(p)}
          className={`flex min-h-11 flex-col items-center justify-center rounded-[var(--radius-s)] px-2 py-1 leading-tight transition-colors ${power === p ? 'bg-lantern text-on-accent shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)]' : 'text-text hover:bg-white/[0.08]'}`}
        >
          <span className="font-display text-lg font-extrabold">{POWER_INFO[p].label}</span>
          <span className={`text-xs ${power === p ? '' : 'text-text-2'}`}>{SHORT_BLURB[p]}</span>
        </button>
      ))}
    </div>
  );
}

/** The five places laid out like a goal: top corners, the middle, bottom corners. */
function GoalButtons({ you, power, disabled, onShoot, onHover }: { you: You; power: Power; disabled: boolean; onShoot: (a: Aim) => void; onHover: (a: Aim | null) => void }) {
  const odds = (a: Aim) => you.odds.find((o) => o.aim === a && o.power === power)!;
  const cell = (a: Aim, cls: string) => (
    <AimButton key={a} odds={odds(a)} read={you.reads[a]} readMax={you.readMax} disabled={disabled} onShoot={() => onShoot(a)} onHover={(on) => onHover(on ? a : null)} className={cls} />
  );
  return (
    <div className="relative rounded-t-[var(--radius-m)] border-x-[6px] border-t-[6px] border-white/90 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.07)_0_2px,transparent_2px_12px),repeating-linear-gradient(-45deg,rgb(255_255_255/0.07)_0_2px,transparent_2px_12px)] p-1.5">
      <div className="grid grid-cols-3 grid-rows-2 gap-1.5" role="group" aria-label={`Where to shoot, ${power}`}>
        {cell('tl', 'col-start-1 row-start-1')}
        {cell('mid', 'col-start-2 row-span-2 row-start-1')}
        {cell('tr', 'col-start-3 row-start-1')}
        {cell('bl', 'col-start-1 row-start-2')}
        {cell('br', 'col-start-3 row-start-2')}
      </div>
    </div>
  );
}

/** Keeper duty: pick the two places your own keeper guards. */
function GuardPicker({ guard, onChange, busy }: { guard: Aim[]; onChange: (g: Aim[]) => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-bold">Your keeper guards (pick two)</p>
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Places your keeper guards">
        {AIMS.map((a) => {
          const on = guard.includes(a);
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => {
                if (on) return;
                onChange([guard[1] ?? guard[0]!, a]);
              }}
              className={`min-h-11 rounded-[var(--radius-s)] px-1 text-xs leading-tight font-bold transition-colors ${on ? 'bg-lantern text-on-accent' : 'bg-white/[0.08] text-text hover:bg-white/[0.14]'}`}
            >
              {AIM_INFO[a].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The last ten seconds: a big final-whistle count. Also used for golden goal's clock. */
function FinalWhistle({ until, gameNow, big = false, label }: { until: number; gameNow: () => number; big?: boolean; label: string }) {
  useNow(250, true);
  const secs = Math.ceil((until - gameNow()) / 1000);
  if (secs > 10 || secs < 0) return null;
  return (
    <div className={`pointer-events-none flex items-center gap-2 rounded-[var(--radius-l)] bg-ember px-4 py-2 text-on-accent shadow-[0_10px_30px_-10px_rgb(0_0_0/0.7)] ${big ? 'text-[clamp(1.4rem,3vw,3rem)]' : 'text-lg'}`} aria-hidden>
      <Timer className="size-[1.1em]" aria-hidden />
      <span className="font-bold">{label}</span>
      <span className="font-display text-[1.5em] leading-none font-extrabold italic tabular">{secs}</span>
    </div>
  );
}

/** Seconds until the picture has played a shot, so the words never give it away early. */
const WAIT_2D = 1100;
const WAIT_MAX = 3600;

/**
 * The result of the newest shot, once the picture has shown it: the 3D scene
 * says when the ball arrives; with no 3D a short wait stands in. A long
 * wait covers a scene that is paused off screen.
 */
function useShotFlow(shot: Shot | null | undefined, threeD: boolean) {
  const [shown, setShown] = useState<Shot | null>(null);
  const [flying, setFlying] = useState(false);
  // Whatever shot was already in the view when the screen opened is history.
  const seen = useRef<number>(shot?.seq ?? 0);
  const pending = useRef<Shot | null>(null);
  const timer = useRef(0);
  const reveal = useCallback((seq?: number) => {
    const p = pending.current;
    if (!p || (seq !== undefined && p.seq !== seq)) return;
    window.clearTimeout(timer.current);
    pending.current = null;
    setShown(p);
    setFlying(false);
    playSfx(shotSound(p));
  }, []);
  // Every view brings a fresh copy of the shot, so this keys on its seq and keeps its own timer.
  const seq = shot?.seq ?? 0;
  useEffect(() => {
    if (!shot || seq === seen.current) return;
    seen.current = seq;
    pending.current = shot;
    setFlying(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => reveal(), threeD ? WAIT_MAX : WAIT_2D);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { shown, flying, reveal };
}

/** Whether this device will draw the 3D scene (the stage tells us for sure once it has built one). */
const draws3D = () => storedChoice() !== 'off' && webglSupported();

/* --------------------------------- player --------------------------------- */

export function SpotKickPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<SpotKickView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [power, setPower] = useState<Power>('placed');
  const [hover, setHover] = useState<Aim | null>(null);
  const [threeD, setThreeD] = useState(draws3D);
  const scene = useRef<SpotKickScene | null>(null);
  const me = room.players.find((p) => p.id === room.me.playerId);
  const look = useMemo(() => lookFor(me?.avatar, fallbackArt(room.me.playerId ?? 'me')), [me?.avatar, room.me.playerId]);
  const crowd = useCrowd(room);
  const { shown, flying, reveal } = useShotFlow(you?.lastShot, threeD);
  const shared = useSharedSounds();
  const fireKey = you?.onFire ? `fire${you.lastShot?.seq ?? 0}` : null;
  useSfx('powerUp', fireKey, Boolean(fireKey));
  useSfx('event', view.golden?.endsAt ?? null, shared && view.golden !== null);
  useAnnounce(shown ? `${shotLine(shown)}${you?.onFire ? ' Three in a row: you are on fire. Your next goal counts double.' : ''}` : null, shown?.seq);
  useAnnounce(view.golden ? `Golden goal. ${view.golden.teams ? 'The teams' : view.golden.leaders.join(' and ')} are level: the next goal by a leader wins.` : null, view.golden?.endsAt ?? null);

  const guard = view.keeperDuty ? (you?.foe?.guard ?? null) : null;
  const state = you ? { balls: you.balls, reads: you.reads, guard, onFire: you.onFire, shot: you.lastShot } : null;
  useEffect(() => {
    if (state) scene.current?.setState(state);
  });
  useEffect(() => scene.current?.setAim(hover), [hover]);
  const onWorld = useCallback(
    (w: SpotKickScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w) {
        w.onResult = (seq) => reveal(seq);
        if (state) w.setState(state);
      }
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!you) return <p className="font-semibold text-text-2">Watching the shoot-out.</p>;

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
  const shoot = (aim: Aim) => {
    playSfx('hit');
    setHover(null);
    void send({ type: 'shoot', aim, power });
  };
  const canShoot = you.balls > 0 && you.canShoot && !paused && !busy && !flying;
  const hint = !you.canShoot ? 'Golden goal: only the players level at the top can shoot. Keep answering.' : you.balls === 0 ? 'No footballs. Answer a question right to earn one.' : flying ? 'Watch the shot…' : 'Pick a strength, then the place to shoot.';
  const pictureLabel = `The penalty spot: ${you.balls ? `a ball is on the spot, ${you.balls} of ${you.maxBalls} footballs held` : 'no football on the spot'}. ${you.onFire ? 'You are on fire. ' : ''}${guard?.length ? `The keeper guards the ${guard.map(place).join(' and the ')}.` : ''}`;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="Your penalties">
        <div className="relative">
          <Stage3D<SpotKickScene>
            label={pictureLabel}
            create={(env) => new SpotKickScene(env, look, crowd)}
            onWorld={onWorld}
            className="h-[32vh] min-h-[220px] rounded-[var(--radius-l)] sm:h-[40vh] lg:h-[52vh]"
            fallback={<GoalMouth shot={you.lastShot} guard={guard} aim={hover} ready={you.balls > 0} onFire={you.onFire} reads={you.reads} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-[var(--radius-m)] bg-lantern px-2.5 py-1 text-on-accent">
              <Trophy className="size-4" aria-hidden />
              <span className="sr-only">Your score:</span>
              <span className="font-display text-xl leading-none font-extrabold tabular">{formatNumber(you.points)}</span>
            </span>
            <span className="flex items-center rounded-[var(--radius-m)] bg-black/55 px-2 py-1 text-white backdrop-blur-sm">
              <Balls n={you.balls} max={you.maxBalls} />
            </span>
            {you.onFire ? (
              <Pill tone="ember" className="text-sm">
                <Flame className="size-4" aria-hidden /> On fire: next goal ×2
              </Pill>
            ) : you.streak > 0 ? (
              <Pill className="bg-black/55 text-sm text-white">
                <Flame className="size-4 text-lantern" aria-hidden /> {you.streak} in a row
              </Pill>
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {view.golden ? null : <FinalWhistle until={view.endsAt} gameNow={gameNow} label="Final whistle" />}
          </div>
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-start gap-1.5">
            {view.golden ? (
              <Pill tone="lantern" className="text-sm">
                Golden goal <Countdown until={view.golden.endsAt} gameNow={gameNow} />
              </Pill>
            ) : null}
            {shown ? (
              <p className={`flex max-w-full items-start gap-2 rounded-[var(--radius-m)] px-3 py-2 text-sm font-bold shadow-[0_8px_20px_-10px_rgb(0_0_0/0.8)] ${shown.outcome === 'goal' ? 'bg-lantern text-on-accent' : 'bg-black/75 text-white'}`}>
                {shown.outcome === 'goal' ? <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Hand className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span>
                  {shotLine(shown)}
                  {shown.outcome === 'goal' ? <span className="ml-1 font-display tabular">+{shown.points}</span> : null}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <StagePanel className="flex flex-col gap-2 p-2.5" as="div">
          <PowerPicker power={power} onPick={setPower} />
          <GoalButtons you={you} power={power} disabled={!canShoot} onShoot={shoot} onHover={setHover} />
          <p className="text-sm font-semibold text-text-2" aria-live="off">
            {hint}
          </p>
        </StagePanel>
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
        {view.keeperDuty && you.guard ? (
          <StagePanel className="flex flex-col gap-2 p-3">
            <p className="text-sm">
              {you.foe?.name ? (
                <>
                  Your next shot is at <strong>{you.foe.name}</strong>’s goal. Their keeper guards the {you.foe.guard.map(place).join(' and the ')}.
                </>
              ) : (
                'No rival is in the game, so you shoot at the house keeper, who guards nothing.'
              )}
            </p>
            <GuardPicker guard={you.guard} busy={busy} onChange={(g) => void send({ type: 'guard', places: g })} />
            <p className="text-sm text-text-2">Your keeper has saved {formatNumber(you.kept)} {you.kept === 1 ? 'shot' : 'shots'}.</p>
          </StagePanel>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions">
        <p className="text-sm font-semibold text-text-2">
          Right answers earn footballs. {you.goals} of {you.shots} shots scored{view.keeperLearns ? '. The keeper learns where you shoot, so mix it up' : ''}.
        </p>
        {you.last && !you.last.correct && you.question ? (
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
        ) : null}
        {you.notes.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {you.notes.map((n) => (
              <li key={n.id} className={n.tone === 'bad' ? 'font-bold text-ember' : n.tone === 'good' ? 'font-bold text-glim' : 'text-text-2'}>
                {n.text}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

/** Glims for the stand: the class's own, then stand-ins. */
function useCrowd(room: ModeScreenProps['room']): GlimLook[] {
  const key = room.players.map((p) => p.id).join('|');
  return useMemo(() => {
    const looks = room.players.slice(0, 12).map((p) => lookFor(p.avatar, fallbackArt(p.id)));
    for (let i = looks.length; i < 12; i++) looks.push(lookFor(null, fallbackArt(`fan-${i}`)));
    return looks;
    // Built once per line-up: the stand does not need to follow every view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/* ---------------------------------- host ---------------------------------- */

function Scoreline({ teams, big = false }: { teams: TeamRow[]; big?: boolean }) {
  const [a, b] = teams;
  if (!a || !b) return null;
  return (
    <div className={`flex items-center justify-center gap-[0.4em] font-display font-extrabold tabular ${big ? 'text-[clamp(2rem,4.4vw,5rem)]' : 'text-4xl'}`} role="img" aria-label={`${a.name} ${a.goals}, ${b.name} ${b.goals}`}>
      <span className="flex items-center gap-2 text-[0.5em]">
        <span className="size-[0.6em] rounded-full ring-2 ring-white/60" style={{ background: `hsl(${a.hue} 80% 60%)` }} aria-hidden />
        {a.name}
      </span>
      <span className="rounded-[var(--radius-m)] bg-white/[0.1] px-[0.3em] leading-tight">{a.goals}</span>
      <span className="text-[0.6em] text-text-2">to</span>
      <span className="rounded-[var(--radius-m)] bg-white/[0.1] px-[0.3em] leading-tight">{b.goals}</span>
      <span className="flex items-center gap-2 text-[0.5em]">
        {b.name}
        <span className="size-[0.6em] rounded-full ring-2 ring-white/60" style={{ background: `hsl(${b.hue} 80% 60%)` }} aria-hidden />
      </span>
    </div>
  );
}

export function SpotKickHost({ view, gameNow, room }: ModeScreenProps<SpotKickView>) {
  const scene = useRef<SpotKickReelScene | null>(null);
  const [threeD, setThreeD] = useState(draws3D);
  const [now, setNow] = useState<{ shot: ReelView; done: boolean } | null>(null);
  const crowd = useCrowd(room);
  const reel = useMemo(() => view.reel ?? [], [view.reel]);
  const shots: ReelShot[] = useMemo(
    () => reel.map((r) => ({ ...r, look: lookFor(room.players.find((p) => p.id === r.by)?.avatar, fallbackArt(r.by)) })),
    [reel, room.players],
  );
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => scene.current?.setShots(shots), [shots]);
  // With no 3D, the newest shot is the one on screen, and its result follows the drawn shot.
  const latest = reel[0] ?? null;
  const flatSeq = useRef<number>(latest?.id ?? 0);
  const flatTimer = useRef(0);
  const latestId = latest?.id ?? 0;
  useEffect(() => {
    if (threeD || !latest || latestId === flatSeq.current) return;
    flatSeq.current = latestId;
    setNow({ shot: latest, done: false });
    window.clearTimeout(flatTimer.current);
    flatTimer.current = window.setTimeout(() => {
      setNow({ shot: latest, done: true });
      playSfx(shotSound(latest));
    }, WAIT_2D);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestId, threeD]);
  useEffect(() => () => window.clearTimeout(flatTimer.current), []);
  useSfx('event', view.golden?.endsAt ?? null, view.golden !== null);
  useAnnounce(now?.done ? shotLine(now.shot, now.shot.name) : null, now?.done ? now.shot.id : null);
  useAnnounce(view.golden ? 'Golden goal: the next goal by a leader wins.' : null, view.golden?.endsAt ?? null);

  // Words and points for a shot wait until its highlight has played: the newest shots are held back.
  const [revealedUpTo, setRevealedUpTo] = useState(() => reel[0]?.id ?? 0);
  useEffect(() => {
    if (now?.done) setRevealedUpTo((n) => Math.max(n, now.shot.id));
  }, [now]);
  // A shot the reel skips (a busy class) is older than one it plays, so it is revealed with it.
  // A picture that cannot play (a hidden tab, a struggling laptop) never holds anything back for long:
  // tick once a second while something is held, so it is let go even when no new view arrives.
  useNow(1000, reel.some((r) => r.id > revealedUpTo));
  const held = reel.filter((r) => r.id > revealedUpTo && gameNow() - r.at < 8000);
  const heldPoints = (id: string) => held.reduce((n, r) => n + (r.by === id ? r.points : 0), 0);
  const rows = view.board
    .map((r) => ({ playerId: r.playerId, name: r.name, score: r.points - heldPoints(r.playerId), rank: 0, teamId: r.teamId }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.score === r.score ? rows[i - 1]!.rank : i + 1));
  const shownReel = reel.filter((r) => !held.includes(r));
  const totals = view.totals
    ? {
        shots: view.totals.shots - held.length,
        goals: view.totals.goals - held.filter((r) => r.outcome === 'goal').length,
        saved: view.totals.saved - held.filter((r) => r.outcome === 'saved').length,
        wide: view.totals.wide - held.filter((r) => r.outcome === 'wide').length,
      }
    : null;
  const teamsShown = view.teams?.map((t) => {
    const minus = held.filter((r) => r.teamId === t.teamId).reduce((n, r) => n + r.points, 0);
    return { ...t, goals: t.goals - minus };
  });
  const house = view.houseMatch && teamsShown && teamsShown.length >= 2;
  const caption = now ? (now.done ? `${now.shot.name}: ${outcomeWord(now.shot.outcome)}${now.shot.outcome === 'goal' && now.shot.fire ? ', double!' : '!'}` : `${now.shot.name} steps up…`) : null;
  const sub = now ? `${POWER_INFO[now.shot.power].label} to the ${place(now.shot.aim)}${now.shot.keeper ? `, at ${now.shot.keeper}’s keeper` : ''}` : null;

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Spot Kick</ModeTitle>
          <p className="font-semibold text-text-2">Right answers earn footballs. Pick a spot, beat the keeper.</p>
        </div>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.golden ? (
            <Pill tone="lantern" className="px-5 py-1.5">
              Golden goal <Countdown until={view.golden.endsAt} gameNow={gameNow} label="Golden goal time left" />
            </Pill>
          ) : null}
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="relative min-h-[50vh]">
          <Stage3D<SpotKickReelScene>
            label={`The stadium: highlights of shots from around the class. ${totals ? `${goalsText(totals.goals)} from ${formatNumber(totals.shots)} shots so far.` : ''}`}
            create={(env) => new SpotKickReelScene(env, crowd)}
            onWorld={(w) => {
              scene.current = w;
              setThreeD(Boolean(w));
              if (w) {
                w.onPlay = (s) => setNow({ shot: s as unknown as ReelView, done: false });
                w.onResult = (s) => {
                  setNow({ shot: s as unknown as ReelView, done: true });
                  playSfx(shotSound(s));
                };
                w.setShots(shotsRef.current);
              }
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<GoalMouth shot={now ? { ...now.shot, seq: now.shot.id } : null} guard={null} aim={null} ready onFire={false} reads={null} big />}
          />
          {house ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <div className="rounded-[var(--radius-l)] bg-black/65 px-5 py-2 text-white backdrop-blur-sm">
                <Scoreline teams={teamsShown!} big />
              </div>
            </div>
          ) : null}
          {caption ? (
            <div className="pointer-events-none absolute right-3 bottom-3 flex max-w-[min(40rem,80%)] flex-col items-end">
              <div className={`plate text-[clamp(1.2rem,2.4vw,2.6rem)] ${now?.done && now.shot.outcome === 'goal' ? 'bg-lantern text-on-accent' : 'bg-black/80 text-white'}`}>
                <span className="truncate font-display font-extrabold">{caption}</span>
              </div>
              {sub ? <p className="mt-1.5 inline-block rounded-[var(--radius-s)] bg-black/60 px-2.5 py-1 text-[clamp(0.95rem,1.4vw,1.4rem)] font-bold text-white">{sub}</p> : null}
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{view.golden ? null : <FinalWhistle until={view.endsAt} gameNow={gameNow} big label="Final whistle in" />}</div>
        </div>
        <StagePanel className="flex flex-col gap-3 p-3" as="aside" label={house ? 'House match' : 'Most goals'}>
          <h3 className="font-display text-xl font-extrabold">{house ? 'House match' : 'Most goals'}</h3>
          {house ? <Scoreline teams={teamsShown!} /> : null}
          <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense label={(r) => goalsText(r.score)} />
          {shownReel.length ? (
            <div>
              <h4 className="mb-1 text-sm font-bold text-text-2">Latest shots</h4>
              <ul className="flex flex-col gap-1 text-sm" aria-label="Latest shots">
                {shownReel.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className={`inline-flex min-w-[4.5rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold ${r.outcome === 'goal' ? 'bg-lantern text-on-accent' : r.outcome === 'saved' ? 'bg-white/[0.12] text-text' : 'bg-ember text-on-accent'}`}>
                      {outcomeWord(r.outcome)}
                      {r.fire ? ' ×2' : ''}
                    </span>
                    <span className="min-w-0 truncate">
                      <strong>{r.name}</strong>, {r.power} to the {place(r.aim)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {totals && totals.shots ? (
            <p className="text-sm font-semibold text-text-2">
              {goalsText(totals.goals)} from {formatNumber(totals.shots)} shots: {formatNumber(totals.saved)} saved, {formatNumber(totals.wide)} missed.
            </p>
          ) : null}
        </StagePanel>
      </div>
    </div>
  );
}
