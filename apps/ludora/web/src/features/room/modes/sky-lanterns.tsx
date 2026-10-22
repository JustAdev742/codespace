import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CloudLightning, CloudSun, Flame, Rocket } from 'lucide-react';
import type { Answer, LanternArt, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { RankBadge, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
import { Lantern } from '../../../art/Lantern.tsx';
import { Button } from '../../../ui/Button.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { formatNumber, ordinal, plural } from '../../../lib/format.ts';

/* Sky Lanterns: earn oil, light lanterns, launch them on the best wind before a storm blows them out. */

type WindKind = 'calm' | 'breezy' | 'gusty' | 'gale';

interface Wind {
  kind: WindKind;
  label: string;
  mult: number;
  since: number;
  changeAt: number | null;
  changes: number;
  storm: { at: number; lost: number } | null;
}

interface Forecast {
  storms: boolean;
  gales: boolean;
  chance: number;
  stormsSoFar: number;
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  score: number;
  ground: number;
  launched: number;
  isYou: boolean;
  rank: number;
}

interface Launch {
  playerId: string;
  name: string;
  count: number;
  mult: number;
  points: number;
  at: number;
}

export interface SkyLanternsView {
  endsAt: number;
  totals: { launched: number; waiting: number };
  cost: number;
  oilCap: number;
  wind: Wind;
  forecast: Forecast;
  board: BoardRow[];
  launches: Launch[];
  teams: { teamId: string; name: string; hue: number; members: number; average: number; total: number }[] | null;
  you: {
    oil: number;
    ground: number;
    score: number;
    launched: number;
    best: number;
    lost: number;
    streak: number;
    question: QuestionView | null;
    last: FeedbackView | null;
    lastLaunch: { count: number; mult: number; points: number; at: number } | null;
    lastLoss: { count: number; at: number } | null;
  } | null;
}

const LANTERN: LanternArt = { hue: 36, accentHue: 14, pattern: 'stars' };

function hashHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Shows each answer's result for a moment before the next question. Keyed by
 * question id, so frequent view updates from other players neither restart
 * nor cancel the timer, and the reveal is matched to the question answered.
 */
function useAnswerFlow(last: FeedbackView | null | undefined, question: QuestionView | null | undefined) {
  const asked = useRef(new Map<string, QuestionView>());
  const lastRef = useRef(last);
  const seen = useRef<string | null>(last?.iid ?? null);
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const lastIid = last?.iid ?? null;
  useEffect(() => {
    lastRef.current = last;
  });
  useEffect(() => {
    if (!question) return;
    asked.current.set(question.iid, question);
    if (asked.current.size > 6) asked.current.delete(asked.current.keys().next().value!);
  }, [question]);
  useEffect(() => {
    if (!lastIid || lastIid === seen.current) return;
    seen.current = lastIid;
    setFeedback(lastRef.current ?? null);
  }, [lastIid]);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), feedback.correct ? 1300 : 2600);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

/** Wind strength as gust lines: one per multiplier step, so strength never relies on colour. */
function WindStreaks({ mult, size = 40 }: { mult: number; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable={false}>
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M4 ${9 + i * 10}H${28 + (i % 2) * 8}a5 5 0 1 0-5-5`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3.6}
          strokeLinecap="round"
          opacity={i < mult ? 1 : 0.18}
        />
      ))}
    </svg>
  );
}

function chanceWord(chance: number): string {
  if (chance < 20) return 'Low risk';
  if (chance < 40) return 'Some risk';
  if (chance < 60) return 'High risk';
  return 'Very high risk';
}

/** The wind on the projector: its strength drawn as gust lines, its name and multiplier, and when it changes. */
function WindPanel({ wind, gameNow }: { wind: Wind; gameNow: () => number }) {
  const tone = wind.mult >= 3 ? 'bg-glim text-on-accent' : wind.mult === 2 ? 'bg-sky text-on-accent' : 'bg-white/15 text-text';
  const small = 'text-[clamp(0.95rem,min(1.3vw,2.3vh),1.4rem)]';
  return (
    <div className={`flex items-center gap-4 rounded-[18px] border border-white/12 px-5 py-[clamp(0.5rem,1.6vh,1rem)] ${NIGHT}`}>
      <span className={`grid size-[clamp(3.5rem,8vh,5.5rem)] shrink-0 place-items-center rounded-[14px] border-[3px] border-ink ${tone}`}>
        <WindStreaks mult={wind.mult} size={52} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`font-bold text-text-2 ${small}`}>{wind.storm ? 'After the storm' : 'Wind now'}</div>
        <div className="font-display text-[clamp(2rem,min(3.4vw,6vh),4.25rem)] leading-none font-extrabold" aria-live="polite" aria-atomic="true">
          {wind.label} <span className="tabular">×{wind.mult}</span>
        </div>
        <div className={`font-semibold text-text-2 ${small}`}>
          {wind.changeAt === null ? (
            'This wind lasts until the end'
          ) : (
            <>
              Changes in <Countdown until={wind.changeAt} gameNow={gameNow} label="Wind changes in" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The storm forecast on the projector. */
function ForecastPanel({ forecast, wind }: { forecast: Forecast; wind: Wind }) {
  const small = 'text-[clamp(0.95rem,min(1.3vw,2.3vh),1.4rem)]';
  const pad = `rounded-[18px] border border-white/12 px-5 py-[clamp(0.5rem,1.6vh,1rem)] ${NIGHT}`;
  if (!forecast.storms) {
    return (
      <div className={`flex items-center gap-3 ${pad}`}>
        <CloudSun className="size-12 shrink-0 text-lantern" aria-hidden />
        <div className="min-w-0">
          <div className={`font-bold text-text-2 ${small}`}>Forecast</div>
          <div className="font-display text-[clamp(1.75rem,min(2.8vw,5vh),3rem)] leading-tight font-extrabold">No storms today</div>
          <div className={`font-semibold text-text-2 ${small}`}>Lanterns are safe on the ground. Wait for a gust, but not too long.</div>
        </div>
      </div>
    );
  }
  const last = wind.changeAt === null;
  const chance = last ? 0 : forecast.chance;
  return (
    <div className={`flex flex-col justify-center ${pad}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-1.5 font-bold text-text-2 ${small}`}>
          <CloudLightning className="size-[1.1em] shrink-0" aria-hidden /> Storm chance at the next change
        </span>
        <span className="font-display text-[clamp(1.75rem,min(3vw,5.4vh),3.25rem)] leading-tight font-extrabold tabular">{last ? 'None' : `${chance}%`}</span>
      </div>
      <div className="relative mt-1 h-[clamp(0.9rem,2vh,1.25rem)] overflow-hidden rounded-full border-2 border-ink bg-[rgb(17_10_62/0.7)]" role="meter" aria-label="Storm chance at the next wind change" aria-valuenow={chance} aria-valuemin={0} aria-valuemax={100}>
        <div className="absolute inset-0 rounded-full bg-ember transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${chance - 100}%)` }} />
      </div>
      <div className={`mt-1 font-semibold text-text-2 ${small}`}>
        {last ? 'No more changes, so no more storms.' : `${chanceWord(chance)}. It rises after every change without a storm.`} {plural(forecast.stormsSoFar, 'storm')} so far{forecast.gales ? '. A rare gale (×4) can blow at any change.' : '.'}
      </div>
    </div>
  );
}

/* The player's panel: one compact readout, so the question below it stays above the fold on a small phone. */

/** The wind for a player: gust lines, name, multiplier and the next change. */
function WindLine({ wind, gameNow }: { wind: Wind; gameNow: () => number }) {
  const tone = wind.mult >= 3 ? 'bg-glim text-on-accent' : wind.mult === 2 ? 'bg-sky text-on-accent' : 'bg-white/15 text-text';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`grid size-9 shrink-0 place-items-center rounded-[12px] border-[3px] border-ink sm:size-12 ${tone}`}>
        <WindStreaks mult={wind.mult} size={26} />
      </span>
      <div className="min-w-0">
        <div className="font-display text-lg leading-tight font-extrabold sm:text-xl" aria-live="polite" aria-atomic="true">
          <span className="sr-only">{wind.storm ? 'After the storm, the wind is ' : 'Wind now: '}</span>
          {wind.label} <span className="tabular">×{wind.mult}</span>
        </div>
        <div className="text-xs font-semibold text-text-2 sm:text-sm">
          {wind.changeAt === null ? (
            'Last wind'
          ) : (
            <>
              Next in <Countdown until={wind.changeAt} gameNow={gameNow} label="Wind changes in" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The storm chance for a player: the number and its bar (the word for it shows from tablet width up). */
function StormLine({ forecast, wind }: { forecast: Forecast; wind: Wind }) {
  if (!forecast.storms) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <CloudSun className="size-7 shrink-0 text-lantern" aria-hidden />
        <div className="min-w-0">
          <div className="text-xs font-bold text-text-2 sm:text-sm">Forecast</div>
          <div className="font-display text-base leading-tight font-extrabold sm:text-lg">No storms</div>
        </div>
      </div>
    );
  }
  const last = wind.changeAt === null;
  const chance = last ? 0 : forecast.chance;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1">
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1 text-xs font-bold text-text-2 sm:text-sm">
          <CloudLightning className="size-[1.1em] shrink-0" aria-hidden /> Storm chance
        </span>
        <span className="font-display text-lg leading-none font-extrabold tabular">{last ? 'None' : `${chance}%`}</span>
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full border-2 border-ink bg-[rgb(17_10_62/0.7)]"
        role="meter"
        aria-label="Storm chance at the next wind change"
        aria-valuenow={chance}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={last ? 'No more storms' : `${chance}%, ${chanceWord(chance).toLowerCase()}`}
      >
        <div className="absolute inset-0 rounded-full bg-ember transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${chance - 100}%)` }} />
      </div>
      <div className="text-sm font-semibold text-text-2 max-sm:hidden">{last ? 'No more storms.' : chanceWord(chance)}</div>
    </div>
  );
}

function OilGauge({ oil, cap, cost }: { oil: number; cap: number; cost: number }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-xs font-bold text-text-2 sm:text-sm">Oil</span>
      <div className="flex min-w-0 flex-1 gap-0.5" role="meter" aria-label="Oil" aria-valuenow={oil} aria-valuemin={0} aria-valuemax={cap}>
        {Array.from({ length: cap }, (_, i) => (
          <span key={i} className={`h-3 min-w-0 flex-1 rounded-[4px] border-2 transition-colors ${i < oil ? 'border-ink bg-lantern' : 'border-white/30 bg-white/10'} ${(i + 1) % cost === 0 && i + 1 < cap ? 'mr-1' : ''}`} />
        ))}
      </div>
      <span className="shrink-0 font-display text-base font-extrabold tabular">
        {oil}/{cap}
        <span className="sr-only"> oil</span>
      </span>
    </div>
  );
}

/** How many of the player's lanterns are lit and waiting, in one line. */
function WaitingLine({ count }: { count: number }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
      <Lantern art={LANTERN} size={18} lit={count > 0} />
      <span className="truncate">{count ? `${count} waiting to launch` : 'None waiting'}</span>
    </div>
  );
}

/** Lit lanterns waiting on the ground under the projector's sky. */
function GroundLanterns({ count, size = 30, max = 8 }: { count: number; size?: number; max?: number }) {
  const shown = Math.min(count, max);
  return (
    <div className="flex min-h-[44px] flex-wrap items-end gap-1" role="img" aria-label={`${plural(count, 'lantern')} waiting on the ground`}>
      {Array.from({ length: shown }, (_, i) => (
        <Lantern key={i} art={LANTERN} size={size} lit />
      ))}
      {count > shown ? <span className="self-center font-display text-lg font-bold tabular">+{count - shown}</span> : null}
    </div>
  );
}

function Advice({ view, safe }: { view: SkyLanternsView; safe: number }) {
  const you = view.you!;
  let text: string | null = null;
  let urgent = true;
  if (you.oil >= view.oilCap) text = 'Your oil can is full. Light a lantern so your next answers are not wasted.';
  else if (you.ground && view.wind.changeAt === null) text = 'This is the last wind. Launch before time runs out!';
  else if (you.ground && view.wind.mult >= 3) text = `${view.wind.label} ×${view.wind.mult}! A great moment to launch.`;
  else if (you.ground && view.forecast.storms && view.forecast.chance >= 50) {
    // Lightning rods: a storm only reaches stacks bigger than `safe`.
    if (you.ground <= safe) text = 'A storm is likely, but your stack is small enough to be safe.';
    else text = safe ? `A storm is likely at the next change, and stacks over ${safe} are at risk. Launch now, or risk it?` : 'A storm is likely at the next change. Launch now, or risk it?';
  } else if (you.oil >= view.cost) {
    text = 'You have enough oil to light a lantern.';
    urgent = false;
  }
  // On a phone only the tips that change what to do now show; the lit Light button already says there is enough oil.
  return text ? <p className={`text-sm leading-snug font-bold text-text-2 ${urgent ? '' : 'max-sm:hidden'}`}>{text}</p> : null;
}

export function SkyLanternsPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<SkyLanternsView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!you) return <p className="font-semibold text-text-2">Watching the sky.</p>;

  const send = async (a: { type: 'light' } | { type: 'launch' }) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const stormHitYou = view.wind.storm && you.lastLoss && you.lastLoss.at === view.wind.storm.at;
  const launchFresh = you.lastLaunch && gameNow() - you.lastLaunch.at < 2500;
  const rank = view.board.find((r) => r.isYou)?.rank ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      {/* Score, sky and lanterns in one panel: the question underneath stays above the fold on a small phone. */}
      <StagePanel as="section" className="flex flex-col gap-1.5 px-2.5 py-2 sm:gap-3 sm:p-4" label="Your lanterns">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="relative font-display text-xl font-extrabold sm:text-2xl">
            {plural(you.score, 'point')}
            {rank && view.board.length > 1 ? <span className="ml-2 text-base text-text-2 sm:text-lg">{ordinal(rank)}</span> : null}
            {launchFresh ? (
              <span key={you.lastLaunch!.at} className="pointer-events-none absolute -top-1 left-0 font-display text-lg font-extrabold whitespace-nowrap text-glim" style={{ animation: 'reaction-float 2.4s var(--ease-out) forwards' }} aria-hidden>
                +{you.lastLaunch!.points}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {you.streak > 1 ? <Pill tone="lantern" className="px-2.5! py-0.5! text-sm sm:text-base">Streak {you.streak}</Pill> : null}
            <Pill className="px-2.5! py-0.5! text-sm sm:text-base">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:gap-x-4 sm:gap-y-2 sm:border-t sm:border-white/12 sm:pt-3">
          <WindLine wind={view.wind} gameNow={gameNow} />
          <StormLine forecast={view.forecast} wind={view.wind} />
          <OilGauge oil={you.oil} cap={view.oilCap} cost={view.cost} />
          <WaitingLine count={you.ground} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" size="lg" className="max-sm:h-10 max-sm:px-2" icon={<Flame className="size-5" />} disabled={paused || busy || you.oil < view.cost} onClick={() => void send({ type: 'light' })}>
            Light ({view.cost} oil)
          </Button>
          <Button variant="success" size="lg" className="max-sm:h-10 max-sm:px-2" icon={<Rocket className="size-5" />} disabled={paused || busy || you.ground === 0} onClick={() => void send({ type: 'launch' })}>
            {you.ground ? `Launch for ${formatNumber(you.ground * view.wind.mult)}` : 'Launch'}
          </Button>
        </div>
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : (
          <Advice view={view} safe={Number(room.room.settings.stormSafe ?? 0)} />
        )}
      </StagePanel>

      {stormHitYou ? (
        <div className={`flex items-center gap-3 rounded-[18px] border-2 border-ember px-4 py-3 font-bold ${NIGHT}`} role="status">
          <CloudLightning className="size-6 shrink-0 text-ember" aria-hidden />
          The storm blew out your {plural(you.lastLoss!.count, 'lantern')}. Launched points are safe.
        </div>
      ) : null}

      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner key={flow.feedback.iid} correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
          {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
          {!flow.feedback.correct ? <Explanation text={flow.feedback.explanation} /> : null}
          <button type="button" onClick={flow.dismiss} className="self-center rounded-[12px] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
            Next question
          </button>
        </div>
      ) : you.question ? (
        <div className="flex flex-col gap-4">
          <QuestionCard q={you.question.q} />
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
        </div>
      ) : null}
    </div>
  );
}

/** Lanterns from recent launches drifting up the sky. */
function RisingLanterns({ launches, gameNow }: { launches: Launch[]; gameNow: () => number }) {
  useNow(1000, launches.length > 0);
  const now = gameNow();
  const live = launches.filter((l) => now - l.at < 5000);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-12 overflow-hidden" aria-hidden>
      {live.flatMap((l) => {
        const base = hashHue(`${l.playerId}:${l.at}`);
        return Array.from({ length: Math.min(l.count, 6) }, (_, i) => (
          <div
            key={`${l.playerId}-${l.at}-${i}`}
            className="absolute bottom-0"
            style={{ left: `${8 + ((base + i * 13) % 84)}%`, animation: `reaction-float 4.5s var(--ease-out) ${i * 140}ms both` }}
          >
            <Lantern art={{ ...LANTERN, hue: (base + i * 40) % 360 }} size={40} lit />
          </div>
        ));
      })}
    </div>
  );
}

/** Every lantern launched so far stays up in the sky, so the big screen fills with light as the game goes on. */
function LanternField({ count }: { count: number }) {
  const shown = Math.min(count, 60);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-12" aria-hidden>
      {Array.from({ length: shown }, (_, i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${3 + ((i * 37 + 11) % 91)}%`, top: `${2 + ((i * 53 + 7) % 72)}%`, opacity: 0.55 + ((i * 7) % 5) * 0.09, animation: `glim-bob ${3 + (i % 4)}s ease-in-out ${(i % 7) * 0.4}s infinite` }}
        >
          <Lantern art={{ ...LANTERN, hue: (i * 29) % 360 }} size={14 + ((i * 5) % 4) * 3} lit />
        </div>
      ))}
    </div>
  );
}

function SkyScene({ view, gameNow, safe }: { view: SkyLanternsView; gameNow: () => number; safe: number }) {
  useNow(1000, Boolean(view.wind.storm));
  const storm = view.wind.storm;
  const freshStorm = storm && gameNow() - storm.at < 6000;
  const waiting = view.totals.waiting;
  return (
    <div className={`relative overflow-hidden rounded-[24px] border border-white/12 p-[clamp(0.75rem,1.6vh,1.25rem)] ${NIGHT}`}>
      <div className="relative grid grid-cols-1 gap-[clamp(0.75rem,1.6vh,1rem)] lg:grid-cols-2">
        <WindPanel wind={view.wind} gameNow={gameNow} />
        <ForecastPanel forecast={view.forecast} wind={view.wind} />
      </div>
      {/* The sky itself takes what the screen can spare (the forecast above may run to two lines), so the scores under it stay on a 768-pixel projector. */}
      <div className="relative mt-[clamp(0.5rem,1.6vh,1rem)] h-[clamp(5rem,10vh,15rem)]">
        <LanternField count={view.totals.launched} />
        <RisingLanterns launches={view.launches} gameNow={gameNow} />
        {view.totals.launched ? <span className="absolute top-1 right-1 text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)] font-bold text-text-2">{plural(view.totals.launched, 'lantern')} in the sky</span> : null}
        {freshStorm ? (
          <div className="absolute inset-x-0 top-0 bottom-10 grid place-items-center rounded-[18px] bg-[rgb(120_20_40/0.55)]" role="status" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
            <div className="flex items-center gap-4 text-left">
              <CloudLightning className="size-[clamp(2.5rem,7vh,4rem)] shrink-0 text-ember" aria-hidden />
              <div>
                <p className={`font-display text-[clamp(2rem,min(4vw,6vh),4rem)] leading-none font-extrabold ${SIGN}`}>Storm!</p>
                <p className="text-[clamp(1.1rem,min(1.7vw,3vh),1.9rem)] font-bold">{storm.lost ? `${plural(storm.lost, 'lantern')} blown out` : safe > 0 && waiting ? 'Every waiting stack was small enough to be safe' : 'Nobody had a lantern waiting'}</p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 border-t-2 border-dashed border-white/35 pt-1.5">
          <GroundLanterns count={waiting} size={24} max={16} />
          <span className="text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)] font-bold text-text-2">{plural(waiting, 'lantern')} waiting on the ground</span>
        </div>
      </div>
    </div>
  );
}

/** Rows on the projector, sized by the screen's height. */
const ROW_GLIM = 'size-[clamp(2rem,4.2vh,3.5rem)]';

/** The ten brightest skies; past five they sit in two columns, so they fit under the sky on a 768-pixel projector. */
function SkyBoard({ rows, players }: { rows: BoardRow[]; players: RoomPlayerView[] }) {
  const two = rows.length > 5;
  return (
    <ol
      className={`grid gap-x-[clamp(0.75rem,1.4vw,1.25rem)] gap-y-1.5 text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)] leading-tight ${two ? 'grid-flow-col grid-cols-2' : 'grid-cols-1'}`}
      aria-label="Scores"
      style={{ '--lb-rank': 'clamp(2rem, 4.2vh, 3.5rem)', gridTemplateRows: two ? `repeat(${Math.ceil(rows.length / 2)}, auto)` : undefined } as CSSProperties}
    >
      {rows.map((r) => (
        <li key={r.playerId} className={`flex min-w-0 items-center gap-[clamp(0.5rem,1vw,0.75rem)] rounded-[20px] border border-white/12 px-3 py-1 ${NIGHT}`}>
          <RankBadge rank={r.rank} big />
          <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={56} className={`${ROW_GLIM} shrink-0`} />
          <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
          {r.ground ? (
            <span className="flex shrink-0 items-center gap-1 font-bold text-text-2" title="Lanterns waiting on the ground">
              <Lantern art={LANTERN} size={22} lit /> {r.ground} <span className="sr-only">waiting</span>
            </span>
          ) : null}
          <span className="min-w-[3ch] shrink-0 text-right font-display text-[1.3em] font-extrabold tabular">{formatNumber(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}

export function SkyLanternsHost({ view, gameNow, room }: ModeScreenProps<SkyLanternsView>) {
  const text = 'text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)]';
  const heading = `mb-[clamp(0.25rem,1vh,0.5rem)] font-display text-[clamp(1.4rem,min(2.2vw,3.9vh),2.5rem)] leading-tight font-extrabold ${SIGN}`;
  // Beside a five-row board there is room for five launches, or three above the team scores.
  const launches = view.launches.slice(0, view.teams ? 3 : 5);
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-[clamp(2.25rem,min(4vw,7vh),4.75rem)] leading-none font-extrabold ${SIGN}`}>Sky Lanterns</h2>
        <Pill className="px-5 py-1.5 text-[clamp(1.25rem,2.2vw,2.5rem)]">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <SkyScene view={view} gameNow={gameNow} safe={Number(room.room.settings.stormSafe ?? 0)} />
      <div className="grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="sky-board">
          <h3 id="sky-board" className={heading}>
            Brightest skies
          </h3>
          <SkyBoard rows={view.board} players={room.players} />
        </section>
        <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
          <section aria-labelledby="sky-launches">
            <h3 id="sky-launches" className={heading}>
              Recent launches
            </h3>
            {launches.length ? (
              <ul className={`flex flex-col gap-1.5 leading-tight ${text}`}>
                {launches.map((l) => (
                  <li key={`${l.playerId}-${l.at}`} className={`flex min-h-[clamp(2.5rem,5.2vh,4.25rem)] items-center gap-3 rounded-[18px] border border-white/12 px-3 py-1 ${NIGHT}`} style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                    <Rocket className="size-[1.1em] shrink-0 text-glim" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-bold">{l.name}</span>
                    <span className="shrink-0 font-semibold text-text-2 tabular">
                      {l.count} × {l.mult}
                    </span>
                    <span className="shrink-0 font-display font-extrabold tabular">+{l.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`font-semibold text-text-2 ${text}`}>No lanterns have flown yet. Who will go first?</p>
            )}
          </section>
          {view.teams ? (
            <StagePanel className="flex flex-col gap-3 p-[clamp(0.75rem,1.6vh,1.25rem)]">
              <h3 className="font-display text-[clamp(1.4rem,min(2.2vw,3.9vh),2.5rem)] font-extrabold">Teams (average points)</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average }))} big />
            </StagePanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
