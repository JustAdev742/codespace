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

function WindPanel({ wind, gameNow, big = false }: { wind: Wind; gameNow: () => number; big?: boolean }) {
  const tone = wind.mult >= 3 ? 'bg-glim text-on-accent' : wind.mult === 2 ? 'bg-sky text-on-accent' : 'bg-white/15 text-text';
  return (
    <div className={`flex items-center rounded-[18px] border border-white/12 ${NIGHT} ${big ? 'gap-4 px-5 py-4' : 'gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3'}`}>
      <span className={`grid shrink-0 place-items-center rounded-[14px] border-[3px] border-ink ${tone} ${big ? 'size-[clamp(4rem,9vh,5.5rem)]' : 'size-11 sm:size-14'}`}>
        <WindStreaks mult={wind.mult} size={big ? 52 : 30} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`font-bold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.4rem)]' : 'text-xs sm:text-sm'}`}>{wind.storm ? 'After the storm' : 'Wind now'}</div>
        <div className={`font-display leading-tight font-extrabold ${big ? 'text-[clamp(2.25rem,4vw,4.25rem)]' : 'text-xl sm:text-2xl'}`} aria-live="polite" aria-atomic="true">
          {wind.label} <span className="tabular">×{wind.mult}</span>
        </div>
        <div className={`font-semibold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.4rem)]' : 'text-xs sm:text-sm'}`}>
          {wind.changeAt === null ? (
            big ? 'This wind lasts until the end' : 'Last wind'
          ) : (
            <>
              {big ? 'Changes in ' : 'Next in '}
              <Countdown until={wind.changeAt} gameNow={gameNow} label="Wind changes in" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ForecastPanel({ forecast, wind, big = false }: { forecast: Forecast; wind: Wind; big?: boolean }) {
  const pad = big ? 'px-5 py-4' : 'px-3 py-2.5 sm:px-4 sm:py-3';
  if (!forecast.storms) {
    return (
      <div className={`flex items-center gap-3 rounded-[18px] border border-white/12 ${NIGHT} ${pad}`}>
        <CloudSun className={`shrink-0 text-lantern ${big ? 'size-12' : 'size-8'}`} aria-hidden />
        <div className="min-w-0">
          <div className={`font-bold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.4rem)]' : 'text-xs sm:text-sm'}`}>Forecast</div>
          <div className={`font-display leading-tight font-extrabold ${big ? 'text-[clamp(1.75rem,2.8vw,3rem)]' : 'text-lg sm:text-xl'}`}>No storms today</div>
          {big ? <div className="text-[clamp(1rem,1.3vw,1.4rem)] font-semibold text-text-2">Lanterns are safe on the ground. Wait for a gust, but not too long.</div> : null}
        </div>
      </div>
    );
  }
  const last = wind.changeAt === null;
  const chance = last ? 0 : forecast.chance;
  return (
    <div className={`flex flex-col justify-center rounded-[18px] border border-white/12 ${NIGHT} ${pad}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-1.5 font-bold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.4rem)]' : 'text-xs sm:text-sm'}`}>
          <CloudLightning className="size-[1.1em] shrink-0" aria-hidden /> {big ? 'Storm chance at the next change' : 'Storm chance'}
        </span>
        <span className={`font-display font-extrabold tabular ${big ? 'text-[clamp(1.75rem,3vw,3.25rem)]' : 'text-xl'}`}>{last ? 'None' : `${chance}%`}</span>
      </div>
      <div className={`relative mt-1.5 overflow-hidden rounded-full border-2 border-ink bg-[rgb(17_10_62/0.7)] ${big ? 'h-5' : 'h-3'}`} role="meter" aria-label="Storm chance at the next wind change" aria-valuenow={chance} aria-valuemin={0} aria-valuemax={100}>
        <div className="absolute inset-0 rounded-full bg-ember transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${chance - 100}%)` }} />
      </div>
      <div className={`mt-1 font-semibold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.4rem)]' : 'text-xs sm:text-sm'}`}>
        {last ? 'No more changes, so no more storms.' : big ? `${chanceWord(chance)}. It rises after every change without a storm.` : chanceWord(chance)}
      </div>
      {big ? (
        <div className="mt-1 text-[clamp(0.95rem,1.2vw,1.3rem)] font-semibold text-text-2">
          {plural(forecast.stormsSoFar, 'storm')} so far{forecast.gales ? '. A rare gale (×4) can blow at any change.' : '.'}
        </div>
      ) : null}
    </div>
  );
}

function OilGauge({ oil, cap, cost }: { oil: number; cap: number; cost: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-text-2">Oil can</span>
        <span className="font-display text-lg font-extrabold tabular">
          {oil} / {cap}
        </span>
      </div>
      <div className="flex gap-1" role="meter" aria-label="Oil" aria-valuenow={oil} aria-valuemin={0} aria-valuemax={cap}>
        {Array.from({ length: cap }, (_, i) => (
          <span key={i} className={`h-4 flex-1 rounded-[5px] border-2 transition-colors ${i < oil ? 'border-ink bg-lantern' : 'border-white/30 bg-white/10'} ${(i + 1) % cost === 0 && i + 1 < cap ? 'mr-1.5' : ''}`} />
        ))}
      </div>
    </div>
  );
}

function GroundLanterns({ count, size = 30, max = 8, emptyText = 'No lanterns on the ground' }: { count: number; size?: number; max?: number; emptyText?: string | null }) {
  const shown = Math.min(count, max);
  return (
    <div className="flex min-h-[44px] flex-wrap items-end gap-1" role="img" aria-label={`${plural(count, 'lantern')} waiting on the ground`}>
      {count === 0 && emptyText ? <span className="self-center text-sm font-semibold text-text-2">{emptyText}</span> : null}
      {Array.from({ length: shown }, (_, i) => (
        <Lantern key={i} art={LANTERN} size={size} lit />
      ))}
      {count > shown ? <span className="self-center font-display text-lg font-bold tabular">+{count - shown}</span> : null}
    </div>
  );
}

function Advice({ view }: { view: SkyLanternsView }) {
  const you = view.you!;
  let text: string | null = null;
  if (you.oil >= view.oilCap) text = 'Your oil can is full. Light a lantern so your next answers are not wasted.';
  else if (you.ground && view.wind.changeAt === null) text = 'This is the last wind. Launch before time runs out!';
  else if (you.ground && view.wind.mult >= 3) text = `${view.wind.label} ×${view.wind.mult}! A great moment to launch.`;
  else if (you.ground && view.forecast.storms && view.forecast.chance >= 50) text = 'A storm is likely at the next change. Launch now, or risk it?';
  else if (you.oil >= view.cost) text = 'You have enough oil to light a lantern.';
  return text ? <p className="text-sm font-bold text-text-2">{text}</p> : null;
}

export function SkyLanternsPlayer({ view, act, gameNow, paused }: ModeScreenProps<SkyLanternsView>) {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative font-display text-2xl font-extrabold">
          {plural(you.score, 'point')}
          {rank && view.board.length > 1 ? <span className="ml-2 text-lg text-text-2">{ordinal(rank)}</span> : null}
          {launchFresh ? (
            <span key={you.lastLaunch!.at} className="pointer-events-none absolute -top-1 left-0 font-display text-lg font-extrabold whitespace-nowrap text-glim" style={{ animation: 'reaction-float 2.4s var(--ease-out) forwards' }} aria-hidden>
              +{you.lastLaunch!.points}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {you.streak > 1 ? <Pill tone="lantern">Streak {you.streak}</Pill> : null}
          <Pill>
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <WindPanel wind={view.wind} gameNow={gameNow} />
        <ForecastPanel forecast={view.forecast} wind={view.wind} />
      </div>

      {stormHitYou ? (
        <div className={`flex items-center gap-3 rounded-[18px] border-2 border-ember px-4 py-3 font-bold ${NIGHT}`} role="status">
          <CloudLightning className="size-6 shrink-0 text-ember" aria-hidden />
          The storm blew out your {plural(you.lastLoss!.count, 'lantern')}. Launched points are safe.
        </div>
      ) : null}

      <StagePanel as="section" className="flex flex-col gap-3 p-4" label="Your lanterns">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
          <OilGauge oil={you.oil} cap={view.oilCap} cost={view.cost} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-text-2">On the ground: {you.ground}</span>
            <GroundLanterns count={you.ground} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" size="lg" className="px-3" icon={<Flame className="size-5" />} disabled={paused || busy || you.oil < view.cost} onClick={() => void send({ type: 'light' })}>
            Light ({view.cost} oil)
          </Button>
          <Button variant="success" size="lg" className="px-3" icon={<Rocket className="size-5" />} disabled={paused || busy || you.ground === 0} onClick={() => void send({ type: 'launch' })}>
            {you.ground ? `Launch for ${formatNumber(you.ground * view.wind.mult)}` : 'Launch'}
          </Button>
        </div>
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : (
          <Advice view={view} />
        )}
      </StagePanel>

      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
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

function SkyScene({ view, gameNow }: { view: SkyLanternsView; gameNow: () => number }) {
  useNow(1000, Boolean(view.wind.storm));
  const storm = view.wind.storm;
  const freshStorm = storm && gameNow() - storm.at < 6000;
  const waiting = view.totals.waiting;
  return (
    <div className={`relative overflow-hidden rounded-[24px] border border-white/12 p-4 sm:p-5 ${NIGHT}`}>
      <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WindPanel wind={view.wind} gameNow={gameNow} big />
        <ForecastPanel forecast={view.forecast} wind={view.wind} big />
      </div>
      <div className="relative mt-4 h-[clamp(10rem,24vh,17rem)]">
        <LanternField count={view.totals.launched} />
        <RisingLanterns launches={view.launches} gameNow={gameNow} />
        {view.totals.launched ? <span className="absolute top-1 right-1 text-[clamp(1rem,1.5vw,1.6rem)] font-bold text-text-2">{plural(view.totals.launched, 'lantern')} in the sky</span> : null}
        {freshStorm ? (
          <div className="absolute inset-x-0 top-0 bottom-12 grid place-items-center rounded-[18px] bg-[rgb(120_20_40/0.55)]" role="status" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
            <div className="text-center">
              <CloudLightning className="mx-auto size-16 text-ember" aria-hidden />
              <p className={`font-display text-[clamp(2.25rem,4vw,4rem)] font-extrabold ${SIGN}`}>Storm!</p>
              <p className="text-[clamp(1.1rem,1.7vw,1.9rem)] font-bold">{storm.lost ? `${plural(storm.lost, 'lantern')} blown out` : 'Nobody had a lantern waiting'}</p>
            </div>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 border-t-2 border-dashed border-white/35 pt-2">
          <GroundLanterns count={waiting} size={26} max={16} emptyText={null} />
          <span className="text-[clamp(1rem,1.5vw,1.6rem)] font-bold text-text-2">{plural(waiting, 'lantern')} waiting on the ground</span>
        </div>
      </div>
    </div>
  );
}

function SkyBoard({ rows, players }: { rows: BoardRow[]; players: RoomPlayerView[] }) {
  return (
    <ol className="flex flex-col gap-1.5 text-[clamp(1.05rem,1.6vw,1.75rem)]" aria-label="Scores" style={{ '--lb-rank': 'clamp(2.5rem, 5.5vh, 3.75rem)' } as CSSProperties}>
      {rows.map((r) => (
        <li key={r.playerId} className={`flex items-center gap-3 rounded-[20px] border border-white/12 px-3 py-1.5 ${NIGHT}`}>
          <RankBadge rank={r.rank} big />
          <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={56} className="size-[clamp(2.5rem,5.5vh,3.75rem)] shrink-0" />
          <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
          {r.ground ? (
            <span className="flex items-center gap-1 font-bold text-text-2" title="Lanterns waiting on the ground">
              <Lantern art={LANTERN} size={24} lit /> {r.ground} <span className="sr-only">waiting</span>
            </span>
          ) : null}
          <span className="min-w-[4ch] text-right font-display text-[1.35em] font-extrabold tabular">{formatNumber(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}

export function SkyLanternsHost({ view, gameNow, room }: ModeScreenProps<SkyLanternsView>) {
  const text = 'text-[clamp(1.05rem,1.6vw,1.75rem)]';
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-[clamp(2.25rem,4vw,4.75rem)] leading-none font-extrabold ${SIGN}`}>Sky Lanterns</h2>
        <Pill className="px-5 py-1.5 text-[clamp(1.25rem,2.2vw,2.5rem)]">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <SkyScene view={view} gameNow={gameNow} />
      <div className="grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="sky-board">
          <h3 id="sky-board" className={`mb-2 font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold ${SIGN}`}>
            Brightest skies
          </h3>
          <SkyBoard rows={view.board} players={room.players} />
        </section>
        <div className="flex flex-col gap-5">
          <section aria-labelledby="sky-launches">
            <h3 id="sky-launches" className={`mb-2 font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold ${SIGN}`}>
              Recent launches
            </h3>
            {view.launches.length ? (
              <ul className={`flex flex-col gap-1.5 ${text}`}>
                {view.launches.map((l) => (
                  <li key={`${l.playerId}-${l.at}`} className={`flex items-center gap-3 rounded-[18px] border border-white/12 px-3 py-2 ${NIGHT}`} style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                    <Rocket className="size-[1.1em] shrink-0 text-glim" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-bold">{l.name}</span>
                    <span className="font-semibold text-text-2 tabular">
                      {l.count} × {l.mult}
                    </span>
                    <span className="font-display font-extrabold tabular">+{l.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`font-semibold text-text-2 ${text}`}>No lanterns have flown yet. Who will go first?</p>
            )}
          </section>
          {view.teams ? (
            <StagePanel className="flex flex-col gap-3 p-5">
              <h3 className="font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold">Teams (average points)</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average }))} big />
            </StagePanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
