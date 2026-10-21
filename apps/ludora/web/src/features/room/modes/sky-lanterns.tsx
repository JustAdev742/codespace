import { useEffect, useRef, useState } from 'react';
import { CloudLightning, CloudSun, Flame, Rocket } from 'lucide-react';
import type { Answer, LanternArt } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { TeamScores } from '../game/Leaderboard.tsx';
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
  const tone = wind.mult >= 3 ? 'bg-glim text-on-accent' : wind.mult === 2 ? 'bg-sky text-on-accent' : 'bg-surface-3 text-text';
  return (
    <div className={`flex items-center rounded-[16px] border border-line bg-raised ${big ? 'gap-4 px-5 py-4' : 'gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3'}`}>
      <span className={`grid shrink-0 place-items-center rounded-[14px] border-2 border-ink ${tone} ${big ? 'size-20' : 'size-11 sm:size-14'}`}>
        <WindStreaks mult={wind.mult} size={big ? 52 : 30} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold tracking-wide text-text-3 uppercase sm:text-xs">{wind.storm ? 'After the storm' : 'Wind now'}</div>
        <div className={`font-display leading-tight font-extrabold ${big ? 'text-5xl' : 'text-xl sm:text-2xl'}`} aria-live="polite" aria-atomic="true">
          {wind.label} <span className="tabular">×{wind.mult}</span>
        </div>
        <div className={`font-semibold text-text-2 ${big ? 'text-lg' : 'text-xs sm:text-sm'}`}>
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
      <div className={`flex items-center gap-3 rounded-[16px] border border-line bg-raised ${pad}`}>
        <CloudSun className={`shrink-0 text-lantern ${big ? 'size-12' : 'size-8'}`} aria-hidden />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wide text-text-3 uppercase sm:text-xs">Forecast</div>
          <div className={`font-display leading-tight font-extrabold ${big ? 'text-3xl' : 'text-lg sm:text-xl'}`}>No storms today</div>
          {big ? <div className="text-lg text-text-2">Lanterns are safe on the ground. Wait for a gust, but not too long.</div> : null}
        </div>
      </div>
    );
  }
  const last = wind.changeAt === null;
  const chance = last ? 0 : forecast.chance;
  return (
    <div className={`flex flex-col justify-center rounded-[16px] border border-line bg-raised ${pad}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-3 uppercase sm:text-xs">
          <CloudLightning className="size-4 shrink-0" aria-hidden /> {big ? 'Storm chance at the next change' : 'Storm chance'}
        </span>
        <span className={`font-display font-extrabold tabular ${big ? 'text-4xl' : 'text-xl'}`}>{last ? 'None' : `${chance}%`}</span>
      </div>
      <div className={`mt-1.5 overflow-hidden rounded-full bg-surface-3 ${big ? 'h-5' : 'h-2.5 sm:h-3'}`} role="meter" aria-label="Storm chance at the next wind change" aria-valuenow={chance} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-ember transition-[width] duration-500" style={{ width: `${chance}%` }} />
      </div>
      <div className={`mt-1 font-semibold text-text-2 ${big ? 'text-lg' : 'text-xs sm:text-sm'}`}>
        {last ? 'No more changes, so no more storms.' : big ? `${chanceWord(chance)}. It rises after every change without a storm.` : chanceWord(chance)}
      </div>
      {big ? (
        <div className="mt-1 text-base text-text-3">
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
        <span className="text-sm font-semibold text-text-2">Oil can</span>
        <span className="font-display text-lg font-bold tabular">
          {oil} / {cap}
        </span>
      </div>
      <div className="flex gap-1" role="meter" aria-label="Oil" aria-valuenow={oil} aria-valuemin={0} aria-valuemax={cap}>
        {Array.from({ length: cap }, (_, i) => (
          <span key={i} className={`h-4 flex-1 rounded-[5px] border transition-colors ${i < oil ? 'border-lantern-deep bg-lantern' : 'border-line bg-surface-3'} ${(i + 1) % cost === 0 && i + 1 < cap ? 'mr-1.5' : ''}`} />
        ))}
      </div>
    </div>
  );
}

function GroundLanterns({ count, size = 30, max = 8, emptyText = 'No lanterns on the ground' }: { count: number; size?: number; max?: number; emptyText?: string | null }) {
  const shown = Math.min(count, max);
  return (
    <div className="flex min-h-[44px] flex-wrap items-end gap-1" role="img" aria-label={`${plural(count, 'lantern')} waiting on the ground`}>
      {count === 0 && emptyText ? <span className="self-center text-sm text-text-3">{emptyText}</span> : null}
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
  return text ? <p className="text-sm font-semibold text-text-2">{text}</p> : null;
}

export function SkyLanternsPlayer({ view, act, gameNow, paused }: ModeScreenProps<SkyLanternsView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!you) return <p className="text-text-2">Watching the sky.</p>;

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
        <div className="relative font-display text-xl font-bold">
          {plural(you.score, 'point')}
          {rank && view.board.length > 1 ? <span className="ml-2 text-base font-semibold text-text-3">{ordinal(rank)}</span> : null}
          {launchFresh ? (
            <span key={you.lastLaunch!.at} className="pointer-events-none absolute -top-1 left-0 font-display text-lg font-extrabold whitespace-nowrap text-glim" style={{ animation: 'reaction-float 2.4s var(--ease-out) forwards' }} aria-hidden>
              +{you.lastLaunch!.points}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-text-2">
          {you.streak > 1 ? <span className="text-lantern">Streak {you.streak}</span> : null}
          <span>
            Time left <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <WindPanel wind={view.wind} gameNow={gameNow} />
        <ForecastPanel forecast={view.forecast} wind={view.wind} />
      </div>

      {stormHitYou ? (
        <div className="flex items-center gap-3 rounded-[16px] border-2 border-ember bg-ember/15 px-4 py-3 font-semibold" role="status">
          <CloudLightning className="size-6 shrink-0 text-ember" aria-hidden />
          The storm blew out your {plural(you.lastLoss!.count, 'lantern')}. Launched points are safe.
        </div>
      ) : null}

      <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-raised p-4" aria-label="Your lanterns">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
          <OilGauge oil={you.oil} cap={view.oilCap} cost={view.cost} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-text-2">On the ground: {you.ground}</span>
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
          <p className="text-sm font-semibold text-ember" role="alert">
            {note}
          </p>
        ) : (
          <Advice view={view} />
        )}
      </section>

      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
          {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
          {!flow.feedback.correct && flow.feedback.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{flow.feedback.explanation}</p> : null}
          <button type="button" onClick={flow.dismiss} className="self-center rounded-[10px] px-3 py-1.5 text-sm font-semibold text-text-2 hover:bg-surface-2">
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
    <div className="relative overflow-hidden rounded-[22px] border border-line bg-sunken p-4 sm:p-5">
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        {[
          [6, 14],
          [18, 40],
          [31, 9],
          [44, 28],
          [57, 12],
          [69, 36],
          [82, 18],
          [93, 44],
          [12, 62],
          [88, 66],
        ].map(([x, y], i) => (
          <span key={i} className="absolute size-1.5 rounded-full bg-text-3" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
      </div>
      <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WindPanel wind={view.wind} gameNow={gameNow} big />
        <ForecastPanel forecast={view.forecast} wind={view.wind} big />
      </div>
      <div className="relative mt-4 h-48 sm:h-60">
        <LanternField count={view.totals.launched} />
        <RisingLanterns launches={view.launches} gameNow={gameNow} />
        {view.totals.launched ? <span className="absolute top-1 right-1 text-lg font-semibold text-text-2">{plural(view.totals.launched, 'lantern')} in the sky</span> : null}
        {freshStorm ? (
          <div className="absolute inset-x-0 top-0 bottom-12 grid place-items-center rounded-[18px] bg-ember/25" role="status" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
            <div className="text-center">
              <CloudLightning className="mx-auto size-16 text-ember" aria-hidden />
              <p className="font-display text-4xl font-extrabold">Storm!</p>
              <p className="text-xl font-semibold text-text-2">{storm.lost ? `${plural(storm.lost, 'lantern')} blown out` : 'Nobody had a lantern waiting'}</p>
            </div>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 border-t-2 border-dashed border-line-strong pt-2">
          <GroundLanterns count={waiting} size={26} max={16} emptyText={null} />
          <span className="text-lg font-semibold text-text-2">{plural(waiting, 'lantern')} waiting on the ground</span>
        </div>
      </div>
    </div>
  );
}

function SkyBoard({ rows }: { rows: BoardRow[] }) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Scores">
      {rows.map((r) => (
        <li key={r.playerId} className="flex items-center gap-3 rounded-[14px] border border-line bg-raised px-3 py-2.5">
          <span className={`w-14 shrink-0 text-center font-display text-2xl font-extrabold tabular ${r.rank <= 3 ? 'text-lantern' : 'text-text-3'}`}>{ordinal(r.rank)}</span>
          <span className="min-w-0 flex-1 truncate text-xl font-semibold">{r.name}</span>
          {r.ground ? (
            <span className="flex items-center gap-1 text-lg font-semibold text-text-2" title="Lanterns waiting on the ground">
              <Lantern art={LANTERN} size={24} lit /> {r.ground} <span className="sr-only">waiting</span>
            </span>
          ) : null}
          <span className="w-24 text-right font-display text-2xl font-bold tabular">{formatNumber(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}

export function SkyLanternsHost({ view, gameNow }: ModeScreenProps<SkyLanternsView>) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold">Sky Lanterns</h2>
        <span className="rounded-full bg-surface-3 px-4 py-1.5 text-xl font-semibold">
          Time left <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </span>
      </div>
      <SkyScene view={view} gameNow={gameNow} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="mb-3 font-display text-2xl font-bold">Brightest skies</h3>
          <SkyBoard rows={view.board} />
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-3 font-display text-2xl font-bold">Recent launches</h3>
            {view.launches.length ? (
              <ul className="flex flex-col gap-2">
                {view.launches.map((l) => (
                  <li key={`${l.playerId}-${l.at}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-raised px-3 py-2 text-lg" style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                    <Rocket className="size-5 shrink-0 text-glim" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
                    <span className="text-text-2 tabular">
                      {l.count} × {l.mult}
                    </span>
                    <span className="font-display font-bold tabular">+{l.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-lg text-text-2">No lanterns have flown yet. Who will go first?</p>
            )}
          </div>
          {view.teams ? (
            <div>
              <h3 className="mb-3 font-display text-2xl font-bold">Teams (average points)</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average }))} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
