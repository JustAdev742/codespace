import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Flame, Shield, ShieldAlert, Swords, Users, Zap } from 'lucide-react';
import type { Answer, GlimArt } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { RankBadge } from '../game/Leaderboard.tsx';
import { Explanation } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
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

function Giant({ enraged, hp, size, className }: { enraged: boolean; hp: number; size: number; className?: string }) {
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
    <div ref={ref} style={{ filter: enraged ? 'brightness(0.72) saturate(1.5) drop-shadow(0 0 22px var(--ember))' : 'brightness(0.6) saturate(1.1) drop-shadow(0 0 18px var(--dusk))' }}>
      <Glim art={enraged ? ENRAGED : GIANT} size={size} bob pose={enraged ? 'cheer' : 'idle'} title={enraged ? 'The Gloom Giant, enraged' : 'The Gloom Giant'} className={className} />
    </div>
  );
}

function HealthBar({ hp, maxHp, enraged, big = false }: { hp: number; maxHp: number; enraged: boolean; big?: boolean }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className={`flex items-center gap-2 font-display font-extrabold whitespace-nowrap ${big ? 'text-[clamp(1.4rem,2.4vw,2.75rem)]' : 'text-lg'}`}>
          {big ? 'Gloom Giant' : 'Health'}
          {enraged ? (
            <Pill tone="ember" className={big ? 'text-[0.55em]' : 'px-2 py-0.5 text-xs'}>
              Enraged
            </Pill>
          ) : null}
        </span>
        <span className={`font-display font-extrabold whitespace-nowrap tabular ${big ? 'text-[clamp(1.6rem,3vw,3.5rem)]' : 'text-xl'}`}>
          {formatNumber(hp)} / {formatNumber(maxHp)}
          <span className="sr-only"> health</span>
        </span>
      </div>
      <div className={`relative overflow-hidden rounded-full border-[3px] border-ink bg-[rgb(17_10_62/0.7)] ${big ? 'h-[clamp(1.75rem,4vh,3rem)]' : 'h-5'}`} role="meter" aria-label="Giant health" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp}>
        <div className="absolute inset-0 rounded-full bg-ember transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${pct - 100}%)` }} />
        {/* Below this line the giant is enraged. */}
        <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-ink/70" aria-hidden />
      </div>
      {big ? <span className="text-[clamp(1rem,1.5vw,1.6rem)] font-semibold text-text-2">{enraged ? 'Enraged: every wrong answer now costs 2 shield.' : 'Below half health the giant becomes enraged.'}</span> : null}
    </div>
  );
}

function ShieldMeter({ shield, max, big = false }: { shield: number; max: number; big?: boolean }) {
  const pips = max <= 24;
  const low = shield <= 2;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`flex items-center gap-2 font-display font-extrabold ${big ? 'text-[clamp(1.4rem,2.4vw,2.75rem)]' : 'text-lg'}`}>
          <Shield className="size-[0.9em]" aria-hidden /> Team shield
        </span>
        <span className={`font-display font-extrabold tabular ${low ? 'text-ember' : ''} ${big ? 'text-[clamp(1.6rem,3vw,3.5rem)]' : 'text-xl'}`}>
          {shield} / {max}
        </span>
      </div>
      {pips ? (
        <div className="flex flex-wrap gap-1" role="meter" aria-label="Team shield" aria-valuenow={shield} aria-valuemin={0} aria-valuemax={max}>
          {Array.from({ length: max }, (_, i) => (
            <Shield key={i} className={`${big ? 'size-[clamp(1.75rem,3.4vh,2.75rem)]' : 'size-6'} ${i < shield ? 'fill-sky text-ink' : 'text-white/35'}`} strokeWidth={2.2} aria-hidden />
          ))}
        </div>
      ) : (
        <div className={`relative overflow-hidden rounded-full border-[3px] border-ink bg-[rgb(17_10_62/0.7)] ${big ? 'h-7' : 'h-4'}`} role="meter" aria-label="Team shield" aria-valuenow={shield} aria-valuemin={0} aria-valuemax={max}>
          <div className="absolute inset-0 rounded-full bg-sky transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${(shield / Math.max(1, max)) * 100 - 100}%)` }} />
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
  if (kind === 'crit') return <Zap className="size-[1.2em] shrink-0 fill-lantern text-ink" aria-hidden />;
  if (kind === 'hit') return <Swords className="size-[1.2em] shrink-0 text-glim" aria-hidden />;
  return <ShieldAlert className="size-[1.2em] shrink-0 text-ember" aria-hidden />;
}

export function GloomGiantPlayer({ view, act, gameNow, paused }: ModeScreenProps<GloomGiantView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  if (!you) return <p className="font-semibold text-text-2">Watching the battle.</p>;
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-2xl font-extrabold">
          {formatNumber(you.damage)} damage
          {you.rank && view.fighters > 1 ? <span className="ml-2 text-lg text-text-2">{ordinal(you.rank)} in the room</span> : null}
        </p>
        <div className="flex items-center gap-2">
          {you.streak > 1 ? (
            <Pill tone="lantern">
              <Flame className="size-4" aria-hidden /> {you.streak >= 3 ? `Streak ${you.streak}: +1 damage` : `Streak ${you.streak}`}
            </Pill>
          ) : null}
          {view.endsAt ? (
            <Pill>
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
          ) : null}
        </div>
      </div>

      <StagePanel as="section" className="flex flex-col gap-3 p-3.5" label="The battle">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <Giant enraged={view.enraged} hp={view.hp} size={84} />
          </div>
          <HealthBar hp={view.hp} maxHp={view.maxHp} enraged={view.enraged} />
        </div>
        <ShieldMeter shield={view.shield} max={view.shieldMax} />
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
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused || view.result !== null} compact />
        </div>
      ) : null}
    </div>
  );
}

export function GloomGiantHost({ view, gameNow, room }: ModeScreenProps<GloomGiantView>) {
  const text = 'text-[clamp(1.05rem,1.6vw,1.75rem)]';
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-[clamp(2.25rem,4vw,4.75rem)] leading-none font-extrabold ${SIGN}`}>Defeat the Gloom Giant</h2>
        <div className="flex items-center gap-3 text-[clamp(1.1rem,1.8vw,2rem)]">
          <Pill className="px-5 py-1.5">
            <Users className="size-[0.9em]" aria-hidden /> {view.fighters} fighting
          </Pill>
          {view.endsAt ? (
            <Pill className="px-5 py-1.5">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
          ) : null}
        </div>
      </div>

      <StagePanel as="section" className="grid grid-cols-1 items-center gap-[clamp(1rem,3vw,3rem)] px-[clamp(1rem,2vw,2rem)] py-[clamp(0.75rem,1.8vh,1.5rem)] md:grid-cols-[auto_1fr]" label="The battle">
        <div className="mx-auto">
          <Giant enraged={view.enraged} hp={view.hp} size={240} className="size-[clamp(8rem,23vh,19rem)]" />
        </div>
        <div className="flex flex-col gap-[clamp(0.75rem,2.4vh,2rem)]">
          <HealthBar hp={view.hp} maxHp={view.maxHp} enraged={view.enraged} big />
          <ShieldMeter shield={view.shield} max={view.shieldMax} big />
        </div>
      </StagePanel>

      <div className="grid grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] lg:grid-cols-2">
        <section aria-labelledby="gg-top">
          <h3 id="gg-top" className={`mb-2 font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold ${SIGN}`}>
            Top damage
          </h3>
          {view.top.some((t) => t.damage > 0) ? (
            <ol className={`flex flex-col gap-1.5 ${text}`} style={{ '--lb-rank': 'clamp(2.5rem, 5.5vh, 3.75rem)' } as CSSProperties}>
              {view.top.map((t) => (
                <li key={t.playerId} className={`flex items-center gap-3 rounded-[18px] border border-white/12 px-3 py-1.5 ${NIGHT}`}>
                  <RankBadge rank={t.rank} big />
                  <PlayerGlim avatar={avatarOf(room.players, t.playerId)} seed={t.playerId} size={56} className="size-[clamp(2.5rem,5.5vh,3.75rem)] shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
                  <span className="font-display text-[1.3em] font-extrabold tabular">{formatNumber(t.damage)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={`${text} font-semibold text-text-2`}>Answer correctly to land the first hit.</p>
          )}
        </section>
        <section aria-labelledby="gg-blows">
          <h3 id="gg-blows" className={`mb-2 font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold ${SIGN}`}>
            Latest blows
          </h3>
          {view.recent.length ? (
            <ul className={`flex flex-col gap-1.5 ${text}`} aria-live="off">
              {view.recent.map((b) => (
                <li key={b.seq} className={`flex items-center gap-3 rounded-[18px] border px-3 py-2 ${NIGHT} ${b.kind === 'strike' ? 'border-ember' : 'border-white/12'}`} style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                  <BlowIcon kind={b.kind} />
                  <span className="min-w-0 truncate font-bold">{b.name}</span>
                  <span className="text-text-2">{blowText(b)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${text} font-semibold text-text-2`}>The giant is waiting. Every correct answer is a hit; every wrong answer cracks the shield.</p>
          )}
        </section>
      </div>
    </div>
  );
}
