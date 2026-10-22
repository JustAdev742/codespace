import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

const percent = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

/** The giant's health on the projector: a thick bar with the enrage line at half. */
function HealthBar({ hp, maxHp, enraged }: { hp: number; maxHp: number; enraged: boolean }) {
  return (
    <div className="flex w-full flex-col gap-[clamp(0.25rem,0.8vh,0.5rem)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 leading-tight">
        <span className="flex items-center gap-2 font-display text-[clamp(1.4rem,min(2.4vw,4.2vh),2.75rem)] font-extrabold whitespace-nowrap">
          Gloom Giant
          {enraged ? (
            <Pill tone="ember" className="text-[0.55em]">
              Enraged
            </Pill>
          ) : null}
        </span>
        <span className="font-display text-[clamp(1.6rem,min(3vw,5vh),3.5rem)] font-extrabold whitespace-nowrap tabular">
          {formatNumber(hp)} / {formatNumber(maxHp)}
          <span className="sr-only"> health</span>
        </span>
      </div>
      <div className="relative h-[clamp(1.5rem,3.6vh,3rem)] overflow-hidden rounded-full border-[3px] border-ink bg-[rgb(17_10_62/0.7)]" role="meter" aria-label="Giant health" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp}>
        <div className="absolute inset-0 rounded-full bg-ember transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${percent(hp, maxHp) - 100}%)` }} />
        {/* Below this line the giant is enraged. */}
        <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-ink/70" aria-hidden />
      </div>
      <span className="text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)] font-semibold text-text-2">{enraged ? 'Enraged: every wrong answer now costs 2 shield.' : 'Below half health the giant becomes enraged.'}</span>
    </div>
  );
}

/** The team shield on the projector: one shield per point while they fit, a bar beyond that. */
function ShieldMeter({ shield, max }: { shield: number; max: number }) {
  const pips = max <= 24;
  const low = shield <= 2;
  return (
    <div className="flex flex-col gap-[clamp(0.25rem,0.8vh,0.5rem)]">
      <div className="flex items-baseline justify-between gap-2 leading-tight">
        <span className="flex items-center gap-2 font-display text-[clamp(1.4rem,min(2.4vw,4.2vh),2.75rem)] font-extrabold">
          <Shield className="size-[0.9em]" aria-hidden /> Team shield
        </span>
        <span className={`font-display text-[clamp(1.6rem,min(3vw,5vh),3.5rem)] font-extrabold tabular ${low ? 'text-ember' : ''}`}>
          {shield} / {max}
        </span>
      </div>
      {pips ? (
        <div className="flex flex-wrap gap-1" role="meter" aria-label="Team shield" aria-valuenow={shield} aria-valuemin={0} aria-valuemax={max}>
          {Array.from({ length: max }, (_, i) => (
            <Shield key={i} className={`size-[clamp(1.5rem,3.2vh,2.75rem)] ${i < shield ? 'fill-sky text-ink' : 'text-white/35'}`} strokeWidth={2.2} aria-hidden />
          ))}
        </div>
      ) : (
        <div className="relative h-7 overflow-hidden rounded-full border-[3px] border-ink bg-[rgb(17_10_62/0.7)]" role="meter" aria-label="Team shield" aria-valuenow={shield} aria-valuemin={0} aria-valuemax={max}>
          <div className="absolute inset-0 rounded-full bg-sky transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${percent(shield, max) - 100}%)` }} />
        </div>
      )}
    </div>
  );
}

/** One line of the phone's battle strip: a label and its number over a slim bar. */
function StripMeter({ label, value, max, unit, meterLabel, fill, low = false, children }: { label: ReactNode; value: number; max: number; unit: string; meterLabel: string; fill: string; low?: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 font-display text-sm leading-tight font-extrabold sm:text-base">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">{label}</span>
        <span className={`whitespace-nowrap tabular ${low ? 'text-ember' : ''}`}>
          {formatNumber(value)} / {formatNumber(max)}
          <span className="sr-only"> {unit}</span>
        </span>
      </div>
      <div className="relative h-3.5 overflow-hidden rounded-full border-2 border-ink bg-[rgb(17_10_62/0.7)]" role="meter" aria-label={meterLabel} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={`absolute inset-0 rounded-full ${fill} transition-transform duration-500 ease-[var(--ease-out)]`} style={{ transform: `translateX(${percent(value, max) - 100}%)` }} />
        {children}
      </div>
    </div>
  );
}

/**
 * The battle on a player's screen: the giant beside its health and the team
 * shield as bars with numbers. Kept to one short strip, so the question and
 * every answer under it stay above the fold on a small phone.
 */
function BattleStrip({ view }: { view: GloomGiantView }) {
  return (
    <StagePanel as="section" className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3" label="The battle">
      <Giant enraged={view.enraged} hp={view.hp} size={72} className="size-14 sm:size-[4.5rem]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <StripMeter
          label={
            <>
              Health
              {view.enraged ? (
                <Pill tone="ember" className="px-2! py-0! text-xs">
                  Enraged
                </Pill>
              ) : null}
            </>
          }
          value={view.hp}
          max={view.maxHp}
          unit="health"
          meterLabel="Giant health"
          fill="bg-ember"
        >
          {/* Below this line the giant is enraged. */}
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink/70" aria-hidden />
        </StripMeter>
        <StripMeter
          label={
            <>
              <Shield className="size-[1em]" aria-hidden /> Team shield
            </>
          }
          value={view.shield}
          max={view.shieldMax}
          unit="shield"
          meterLabel="Team shield"
          fill="bg-sky"
          low={view.shield <= 2}
        />
      </div>
    </StagePanel>
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-2xl font-extrabold">
          {formatNumber(you.damage)} damage
          {you.rank && view.fighters > 1 ? <span className="ml-2 text-base text-text-2 min-[400px]:text-lg">{ordinal(you.rank)} in the room</span> : null}
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

      <BattleStrip view={view} />

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

/** Projector list rows: sized by the screen's height, so six rows and the battle fit a 768-pixel projector. */
const HOST_GLIM = 'size-[clamp(2rem,4.2vh,3.5rem)]';
/** The server sends up to eight blows; six fit beside the top damage. */
const BLOWS_SHOWN = 6;

export function GloomGiantHost({ view, gameNow, room }: ModeScreenProps<GloomGiantView>) {
  const text = 'text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)]';
  const heading = `mb-[clamp(0.25rem,1vh,0.5rem)] font-display text-[clamp(1.4rem,min(2.2vw,3.9vh),2.5rem)] leading-tight font-extrabold ${SIGN}`;
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-[clamp(2.25rem,min(4vw,7vh),4.75rem)] leading-none font-extrabold ${SIGN}`}>Defeat the Gloom Giant</h2>
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

      <StagePanel as="section" className="grid grid-cols-1 items-center gap-[clamp(1rem,3vw,3rem)] px-[clamp(1rem,2vw,2rem)] py-[clamp(0.5rem,1.4vh,1.5rem)] md:grid-cols-[auto_1fr]" label="The battle">
        <div className="mx-auto">
          <Giant enraged={view.enraged} hp={view.hp} size={240} className="size-[clamp(6.5rem,19vh,17rem)]" />
        </div>
        {/* Health and shield side by side on a projector, so the panel is no taller than the giant. */}
        <div className="grid grid-cols-1 items-start gap-x-[clamp(1.5rem,3vw,3rem)] gap-y-[clamp(0.5rem,1.8vh,1.5rem)] lg:grid-cols-2">
          <HealthBar hp={view.hp} maxHp={view.maxHp} enraged={view.enraged} />
          <ShieldMeter shield={view.shield} max={view.shieldMax} />
        </div>
      </StagePanel>

      <div className="grid grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] lg:grid-cols-2">
        <section aria-labelledby="gg-top">
          <h3 id="gg-top" className={heading}>
            Top damage
          </h3>
          {view.top.some((t) => t.damage > 0) ? (
            <ol className={`flex flex-col gap-1.5 leading-tight ${text}`} style={{ '--lb-rank': 'clamp(2rem, 4.2vh, 3.5rem)' } as CSSProperties}>
              {view.top.map((t) => (
                <li key={t.playerId} className={`flex items-center gap-3 rounded-[18px] border border-white/12 px-3 py-1 ${NIGHT}`}>
                  <RankBadge rank={t.rank} big />
                  <PlayerGlim avatar={avatarOf(room.players, t.playerId)} seed={t.playerId} size={56} className={`${HOST_GLIM} shrink-0`} />
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
          <h3 id="gg-blows" className={heading}>
            Latest blows
          </h3>
          {view.recent.length ? (
            <ul className={`flex flex-col gap-1.5 leading-tight ${text}`} aria-live="off">
              {view.recent.slice(0, BLOWS_SHOWN).map((b) => (
                <li key={b.seq} className={`flex min-h-[clamp(2.5rem,5.2vh,4.25rem)] items-center gap-3 rounded-[18px] border px-3 py-1 ${NIGHT} ${b.kind === 'strike' ? 'border-ember' : 'border-white/12'}`} style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                  <BlowIcon kind={b.kind} />
                  <span className="max-w-[55%] min-w-0 shrink-0 truncate font-bold">{b.name}</span>
                  <span className="min-w-0 flex-1 truncate text-text-2">{blowText(b)}</span>
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
