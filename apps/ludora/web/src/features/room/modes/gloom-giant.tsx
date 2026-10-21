import { useEffect, useRef, useState } from 'react';
import { Shield, ShieldAlert, Swords, Zap } from 'lucide-react';
import type { Answer, GlimArt } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
import { prefersReducedMotion } from '../../../lib/prefs.ts';
import { formatNumber, ordinal } from '../../../lib/format.ts';

/* Gloom Giant: the whole room against one boss. Hit it with correct answers; wrong answers crack the shared shield. */

interface Blow {
  seq: number;
  name: string;
  kind: 'hit' | 'crit' | 'strike';
  amount: number;
  at: number;
  isYou: boolean;
}

export interface GloomGiantView {
  endsAt: number | null;
  hp: number;
  maxHp: number;
  enraged: boolean;
  shield: number;
  shieldMax: number;
  fighters: number;
  result: 'win' | 'loss' | null;
  top: { playerId: string; name: string; damage: number; isYou: boolean; rank: number }[];
  recent: Blow[];
  you: {
    damage: number;
    hits: number;
    crits: number;
    misses: number;
    rank: number | null;
    streak: number;
    question: QuestionView | null;
    last: FeedbackView | null;
  } | null;
}

/** The giant: a Glim drawn big, pale and low-saturation, then darkened, with one staring eye. */
const GIANT: GlimArt = { kind: 'glim', body: 'ghost', hue: 252, accentHue: 280, saturation: 20, eyes: 'cyclops', mouth: 'tooth', pattern: 'patch', topper: 'horns', cheeks: false };
const ENRAGED: GlimArt = { ...GIANT, hue: 354, accentHue: 18, saturation: 48, mouth: 'grin', topper: 'spikes' };

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
    const t = setTimeout(() => setFeedback(null), feedback.correct ? 1200 : 2600);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

function Giant({ enraged, hp, size }: { enraged: boolean; hp: number; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(hp);
  // A small flinch whenever the giant takes damage (skipped for reduced motion).
  useEffect(() => {
    if (hp < prev.current && ref.current && !prefersReducedMotion()) {
      ref.current.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-2.5%)' }, { transform: 'translateX(2%)' }, { transform: 'translateX(0)' }], { duration: 280, easing: 'ease-out' });
    }
    prev.current = hp;
  }, [hp]);
  return (
    <div ref={ref} style={{ filter: enraged ? 'brightness(0.72) saturate(1.5) drop-shadow(0 0 22px var(--ember))' : 'brightness(0.6) saturate(1.1) drop-shadow(0 0 16px var(--dusk))' }}>
      <Glim art={enraged ? ENRAGED : GIANT} size={size} bob title={enraged ? 'The Gloom Giant, enraged' : 'The Gloom Giant'} />
    </div>
  );
}

function HealthBar({ hp, maxHp, enraged, big = false }: { hp: number; maxHp: number; enraged: boolean; big?: boolean }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-display font-bold ${big ? 'text-2xl' : 'text-base'}`}>
          Gloom Giant
          {enraged ? <span className={`ml-2 rounded-full bg-ember px-2 py-0.5 align-middle font-sans font-bold text-on-accent ${big ? 'text-base' : 'text-xs'}`}>Enraged</span> : null}
        </span>
        <span className={`font-display font-bold tabular ${big ? 'text-3xl' : 'text-lg'}`}>
          {formatNumber(hp)} / {formatNumber(maxHp)}
          <span className="sr-only"> health</span>
        </span>
      </div>
      <div className={`relative overflow-hidden rounded-full border-2 border-ink bg-surface-3 ${big ? 'h-8' : 'h-4'}`} role="meter" aria-label="Giant health" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp}>
        <div className="h-full rounded-full bg-ember transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${pct}%` }} />
        {/* Below this line the giant is enraged. */}
        <span className="absolute inset-y-0 left-1/2 w-0.5 bg-ink/60" aria-hidden />
      </div>
      {big ? <span className="text-base text-text-2">{enraged ? 'Enraged: every wrong answer now costs 2 shield.' : 'Below half health the giant becomes enraged.'}</span> : null}
    </div>
  );
}

function ShieldMeter({ shield, max, big = false }: { shield: number; max: number; big?: boolean }) {
  const pips = max <= 24;
  const low = shield <= 2;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`flex items-center gap-1.5 font-display font-bold ${big ? 'text-2xl' : 'text-base'}`}>
          <Shield className={big ? 'size-6' : 'size-4'} aria-hidden /> Team shield
        </span>
        <span className={`font-display font-bold tabular ${low ? 'text-ember' : ''} ${big ? 'text-3xl' : 'text-lg'}`}>
          {shield} / {max}
        </span>
      </div>
      {pips ? (
        <div className="flex flex-wrap gap-1" role="meter" aria-label="Team shield" aria-valuenow={shield} aria-valuemin={0} aria-valuemax={max}>
          {Array.from({ length: max }, (_, i) => (
            <Shield key={i} className={`${big ? 'size-8' : 'size-5'} ${i < shield ? 'fill-sky text-ink' : 'text-line-strong opacity-60'}`} strokeWidth={2} aria-hidden />
          ))}
        </div>
      ) : (
        <div className={`overflow-hidden rounded-full border-2 border-ink bg-surface-3 ${big ? 'h-6' : 'h-3'}`} role="meter" aria-label="Team shield" aria-valuenow={shield} aria-valuemin={0} aria-valuemax={max}>
          <div className="h-full rounded-full bg-sky transition-[width] duration-500" style={{ width: `${(shield / Math.max(1, max)) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function blowText(b: Blow) {
  if (b.kind === 'crit') return `critical hit for ${b.amount}!`;
  if (b.kind === 'hit') return `hit for ${b.amount}`;
  return `missed: shield −${b.amount}`;
}

function BlowIcon({ kind }: { kind: Blow['kind'] }) {
  if (kind === 'crit') return <Zap className="size-5 shrink-0 fill-lantern text-ink" aria-hidden />;
  if (kind === 'hit') return <Swords className="size-5 shrink-0 text-glim" aria-hidden />;
  return <ShieldAlert className="size-5 shrink-0 text-ember" aria-hidden />;
}

export function GloomGiantPlayer({ view, act, gameNow, paused }: ModeScreenProps<GloomGiantView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  if (!you) return <p className="text-text-2">Watching the battle.</p>;
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-xl font-bold">
          You: {formatNumber(you.damage)} damage
          {you.rank && view.fighters > 1 ? <span className="ml-2 text-base font-semibold text-text-3">{ordinal(you.rank)} in the room</span> : null}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-text-2">
          {you.streak >= 3 ? <span className="text-lantern">Streak {you.streak}: +1 damage</span> : you.streak > 1 ? <span className="text-lantern">Streak {you.streak}</span> : null}
          {view.endsAt ? (
            <span>
              Time left <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </span>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-raised p-4" aria-label="The battle">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <Giant enraged={view.enraged} hp={view.hp} size={72} />
          </div>
          <HealthBar hp={view.hp} maxHp={view.maxHp} enraged={view.enraged} />
        </div>
        <ShieldMeter shield={view.shield} max={view.shieldMax} />
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
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused || view.result !== null} compact />
        </div>
      ) : null}
    </div>
  );
}

export function GloomGiantHost({ view, gameNow }: ModeScreenProps<GloomGiantView>) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold">Defeat the Gloom Giant</h2>
        <div className="flex items-center gap-3 text-xl font-semibold text-text-2">
          <span>{view.fighters} fighting</span>
          {view.endsAt ? (
            <span className="rounded-full bg-surface-3 px-4 py-1.5 text-text">
              Time left <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </span>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-1 items-center gap-6 rounded-[22px] border border-line bg-sunken p-5 md:grid-cols-[auto_1fr]" aria-label="The battle">
        <div className="mx-auto">
          <Giant enraged={view.enraged} hp={view.hp} size={260} />
        </div>
        <div className="flex flex-col gap-6">
          <HealthBar hp={view.hp} maxHp={view.maxHp} enraged={view.enraged} big />
          <ShieldMeter shield={view.shield} max={view.shieldMax} big />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-display text-2xl font-bold">Top damage</h3>
          {view.top.some((t) => t.damage > 0) ? (
            <ol className="flex flex-col gap-2">
              {view.top.map((t) => (
                <li key={t.playerId} className="flex items-center gap-3 rounded-[14px] border border-line bg-raised px-3 py-2.5">
                  <span className={`w-10 text-center font-display text-2xl font-extrabold tabular ${t.rank <= 3 ? 'text-lantern' : 'text-text-3'}`}>{ordinal(t.rank)}</span>
                  <span className="min-w-0 flex-1 truncate text-xl font-semibold">{t.name}</span>
                  <span className="font-display text-2xl font-bold tabular">{formatNumber(t.damage)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-lg text-text-2">Answer correctly to land the first hit.</p>
          )}
        </div>
        <div>
          <h3 className="mb-3 font-display text-2xl font-bold">Latest blows</h3>
          {view.recent.length ? (
            <ul className="flex flex-col gap-2" aria-live="off">
              {view.recent.map((b) => (
                <li key={b.seq} className={`flex items-center gap-3 rounded-[14px] border px-3 py-2 text-lg ${b.kind === 'strike' ? 'border-ember/50 bg-ember/10' : 'border-line bg-raised'}`} style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                  <BlowIcon kind={b.kind} />
                  <span className="min-w-0 truncate font-semibold">{b.name}</span>
                  <span className="text-text-2">{blowText(b)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg text-text-2">The giant is waiting. Every correct answer is a hit; every wrong answer cracks the shield.</p>
          )}
        </div>
      </div>
    </div>
  );
}
