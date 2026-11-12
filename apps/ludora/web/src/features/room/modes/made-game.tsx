import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Coins, Flag, Gem, Hash, Heart, KeyRound, RotateCw, Sparkles, Star, Zap, type LucideIcon } from 'lucide-react';
import { amountOf, EVENT_INFO, POWER_INFO, describeBlueprint, KINDS_3D, type Answer } from '@ludora/shared';
import type { MadeLast, MadeView } from '@ludora/engine';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer, shortAnswer } from '../game/Reveal.tsx';
import { Explanation, HudCount, HudScore, IntroScreen, LockedIn, ModeTitle, RoundHeader, StreakChip, myAvatar } from '../game/parts.tsx';
import { Pill, PlayerGlim, StagePanel } from '../game/stage.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Button } from '../../../ui/Button.tsx';
import { ordinal } from '../../../lib/format.ts';
import { GemGrid, MadeBoard } from './made-game-board.tsx';

/*
 * Screens for made games (Game Maker): one player screen and one big-screen board for every
 * blueprint, built from the shared question parts, so sound, hints and every question type work
 * as in the built-in modes. Races and climbs made in 3D draw their scene above the board; the
 * board is the drawn 2D picture when 3D is off.
 */


const MadeScene = lazy(() => import('./made-game-3d.tsx'));

/** "+3 steps (Quick +1, Shortcut)", or the notes alone when nothing moved. */
export function lastWords(last: MadeLast | null, unit: string): string | null {
  if (!last) return null;
  const amount = last.amount !== 0 ? `${last.amount > 0 ? '+' : '−'}${amountOf(Math.abs(last.amount), unit)}` : '';
  const notes = last.notes.join(', ');
  if (amount && notes) return `${amount} (${notes})`;
  return amount || notes || null;
}

function EventPill({ view, gameNow }: { view: MadeView; gameNow: () => number }) {
  if (!view.event) return null;
  const info = EVENT_INFO[view.event.type];
  return (
    <Pill tone="dusk">
      <Sparkles className="size-[1em]" aria-hidden /> {info.label}
      {view.event.until ? (
        <>
          , <Countdown until={view.event.until} gameNow={gameNow} label={`${info.label} ends in`} />
        </>
      ) : null}
    </Pill>
  );
}

function PowerBar({ view, act, disabled }: { view: MadeView; act: ModeScreenProps['act']; disabled: boolean }) {
  const you = view.you;
  if (!you || !view.game.extras.powers.length) return null;
  if (you.power) {
    const info = POWER_INFO[you.power];
    return (
      <StagePanel className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="min-w-0 text-sm font-semibold">
          <span className="font-bold">{info.label}:</span> {info.help}
        </p>
        <Button size="md" variant="primary" icon={<Zap className="size-4" aria-hidden />} disabled={disabled} onClick={() => void act({ type: 'power' })}>
          Use {info.label}
        </Button>
      </StagePanel>
    );
  }
  const status = [you.double ? 'Double is ready for your next right answer.' : null, you.shield ? 'Your shield is up.' : null, you.frozen ? 'You are frozen: your next right answer gains nothing.' : null].filter(Boolean).join(' ');
  return (
    <p className="text-sm font-semibold text-text-2">
      {status || (you.nextPowerIn !== null ? `${you.nextPowerIn === 1 ? '1 more right answer' : `${you.nextPowerIn} more right answers`} for a power-up.` : null)}
    </p>
  );
}

/** A picture for a number the maker named, so "coins" looks like coins and "health" like hearts. */
const VAR_ICONS: [RegExp, LucideIcon][] = [
  [/^(coins?|gold|money|cash|pennies)$/, Coins],
  [/^(health|hearts?|hp|lives)$/, Heart],
  [/^keys?$/, KeyRound],
  [/^stars?$/, Star],
  [/^(gems?|jewels?|crystals?)$/, Gem],
  [/^(energy|power|zaps?)$/, Zap],
  [/^flags?$/, Flag],
  [/^(rounds?|turns?|laps?)$/, RotateCw],
];
const varIcon = (name: string) => VAR_ICONS.find(([re]) => re.test(name))?.[1] ?? Hash;

/** The game's own numbers: yours, your team's and the whole game's, each with its picture. */
function VarPills({ view }: { view: MadeView }) {
  const all = [...(view.you?.vars ?? []).map((v) => ({ ...v, label: v.scope === 'team' ? `Team ${v.name}` : v.name })), ...(view.vars ?? []).map((v) => ({ ...v, label: v.name }))];
  if (!all.length && !view.doubled) return null;
  return (
    <>
      {all.map((v) => {
        const Icon = varIcon(v.name);
        return (
          <Pill key={v.label}>
            <Icon className="size-4" aria-hidden />
            <span>
              {v.value} <span className="font-semibold">{v.label}</span>
            </span>
          </Pill>
        );
      })}
      {view.doubled ? <Pill tone="lantern">Double points</Pill> : null}
    </>
  );
}

/** The HUD row every player sees: your total, lives, streak, the event and the clock. */
function PlayerHud({ view, gameNow }: { view: MadeView; gameNow: () => number }) {
  const you = view.you!;
  const bp = view.game;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {you.place ? (
        <p className="plate plate-gold text-2xl">
          <span>{bp.kind.type === 'tug' ? 'Your team won' : `You finished ${ordinal(you.place)}`}</span>
        </p>
      ) : (
        <HudScore value={you.score} unit={bp.unit} label={bp.unit} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {you.lives !== null ? <Pill tone={you.lives > 0 ? 'ember' : 'calm'}>{you.out ? 'Out' : `${you.lives} ${you.lives === 1 ? 'life' : 'lives'}`}</Pill> : null}
        <StreakChip streak={you.streak} />
        <VarPills view={view} />
        <EventPill view={view} gameNow={gameNow} />
        <Pill>
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
    </div>
  );
}

function Scene({ view, room, big }: { view: MadeView; room: ModeScreenProps['room']; big: boolean }) {
  if (view.game.look.dimension !== '3d' || !KINDS_3D.includes(view.game.kind.type)) return null;
  return (
    <Suspense fallback={null}>
      <MadeScene view={view} players={room.players} me={room.me.playerId ?? null} big={big} />
    </Suspense>
  );
}

function OwnPace({ view, act, room }: ModeScreenProps<MadeView>) {
  const you = view.you!;
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const [shown, setShown] = useState<QuestionView | null>(null);
  const lastSeen = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(new Map<string, QuestionView>());
  const latest = useRef(you.feedback);
  latest.current = you.feedback;
  const lastIid = you.feedback?.iid ?? null;
  useEffect(() => {
    const last = latest.current;
    if (!last || last.iid === lastSeen.current) return;
    lastSeen.current = last.iid;
    setFeedback(last);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), last.correct ? 1100 : 2200);
  }, [lastIid]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    if (you.question) asked.current.set(you.question.iid, you.question);
    if (!feedback) setShown(you.question ?? null);
  }, [you.question, feedback]);
  const submit = async (answer: Answer) => (shown ? (await act({ type: 'answer', iid: shown.iid, answer })).ok : false);
  const answeredQ = feedback ? (asked.current.get(feedback.iid) ?? null) : null;
  if (you.out || you.done || you.place) {
    return (
      <StagePanel className="flex items-center gap-4 px-4 py-4">
        <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={72} pose={you.place ? 'cheer' : undefined} className={`shrink-0 ${you.out ? 'grayscale' : ''}`} />
        <p className="font-semibold" role="status">
          {you.out ? 'You are out. Watch how the others do.' : you.place ? 'You made it. Watch the rest of the game.' : 'You have answered all your questions. Watch the rest of the game.'}
        </p>
      </StagePanel>
    );
  }
  if (feedback) {
    return (
      <div className="flex flex-col gap-3" onClick={() => setFeedback(null)}>
        <ResultBanner key={feedback.iid} correct={feedback.correct} partial={feedback.partial} text={feedback.text} answer={answeredQ ? shortAnswer(answeredQ.q, feedback.reveal) : null} />
        {!feedback.correct && answeredQ ? <RevealAnswer q={answeredQ.q} reveal={feedback.reveal} compact /> : null}
        {!feedback.correct ? <Explanation text={feedback.explanation} /> : null}
        <button type="button" onClick={() => setFeedback(null)} className="min-h-11 self-center rounded-[var(--radius-m)] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
          Continue
        </button>
      </div>
    );
  }
  return shown ? (
    <div className="flex flex-col gap-4">
      <QuestionCard q={shown.q} />
      <AnswerInput key={shown.iid} q={shown.q} onSubmit={submit} compact />
    </div>
  ) : null;
}

function Rounds({ view, act, gameNow, paused, room }: ModeScreenProps<MadeView>) {
  const s = view.sync!;
  const you = view.you!;
  const seed = room.me.playerId ?? 'you';
  if (s.phase === 'intro') {
    return (
      <IntroScreen kicker="Get ready" title={room.room.title} until={s.phaseEndsAt} gameNow={gameNow} room={room} art={<PlayerGlim avatar={myAvatar(room)} seed={seed} size={110} />}>
        {view.game.goal || describeBlueprint(view.game)[0]}
      </IntroScreen>
    );
  }
  const q = s.question;
  if (s.phase === 'leaderboard' || s.phase === 'done' || !q) return null;
  if (you.out) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <PlayerGlim avatar={myAvatar(room)} seed={seed} size={84} className="grayscale" />
        <p className="font-display text-[1.75rem] font-bold" role="status">
          You are out
        </p>
        <QuestionCard q={q.q} index={q.index} total={q.total} />
      </div>
    );
  }
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  const words = lastWords(you.last, view.game.unit);
  return (
    <div className="flex flex-col gap-4">
      <RoundHeader round={s.round} total={s.total} />
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        s.you?.answered ? (
          <LockedIn answered={s.answered} eligible={s.eligible} avatar={myAvatar(room)} seed={seed} />
        ) : (
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {q.q.type === 'poll' ? (
            <p className="font-semibold text-text-2">Polls score nothing in this game.</p>
          ) : (
            <ResultBanner correct={s.you?.answered ? (s.you.correct ?? false) : false} missed={!s.you?.answered} partial={s.you?.partial} text={words ?? undefined} answer={s.reveal ? shortAnswer(q.q, s.reveal) : null} />
          )}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          <Explanation text={s.explanation} />
        </div>
      )}
    </div>
  );
}

export function MadeGamePlayer(props: ModeScreenProps<MadeView>) {
  const { view, act, gameNow, paused, room } = props;
  const you = view.you;
  const bp = view.game;
  // Moves that are not answers (a square opened, a power used) are announced as they land.
  useAnnounce(you?.last && you.last.correct === null ? lastWords(you.last, bp.unit) : null, you?.last?.seq);
  if (!you) return <p className="font-semibold text-text-2">Watching the game.</p>;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      <PlayerHud view={view} gameNow={gameNow} />
      {view.sync ? <Rounds {...props} /> : <OwnPace {...props} />}
      {you.grid ? <GemGrid grid={you.grid} picks={you.picks} unit={bp.unit} disabled={paused || you.out} onPick={(cell) => void act({ type: 'pick', cell })} /> : null}
      <PowerBar view={view} act={act} disabled={paused || you.out} />
      <Scene view={view} room={room} big={false} />
      <MadeBoard view={view} players={room.players} teams={room.room.teams} me={room.me.playerId ?? null} />
    </div>
  );
}

export function MadeGameHost({ view, gameNow, paused, room }: ModeScreenProps<MadeView>) {
  const bp = view.game;
  const s = view.sync;
  const rules = describeBlueprint(bp);
  if (s?.phase === 'intro') {
    return (
      <IntroScreen kicker="Get ready" title={room.room.title} until={s.phaseEndsAt} gameNow={gameNow} room={room} big>
        {bp.goal || rules[0]}
      </IntroScreen>
    );
  }
  const q = s?.question ?? null;
  const asking = s && q && (s.phase === 'question' || s.phase === 'reveal');
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {s && asking ? <RoundHeader round={s.round} total={s.total} big /> : <ModeTitle>{bp.name}</ModeTitle>}
        <div className="flex flex-wrap items-center gap-3 text-[clamp(1.1rem,1.8vw,2rem)]">
          <EventPill view={view} gameNow={gameNow} />
          {s && asking ? <HudCount value={s.answered} total={s.eligible} label="answered" big /> : null}
          <Pill className="px-5 py-1.5">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      {asking && q && s ? (
        <>
          {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} size="lg" /> : null}
          <QuestionCard q={q.q} size="lg" />
          {s.phase === 'question' ? <ChoicesDisplay q={q.q} /> : s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} size="lg" /> : null}
          {s.phase === 'reveal' ? <MadeBoard view={view} players={room.players} teams={room.room.teams} big /> : null}
        </>
      ) : (
        <>
          <Scene view={view} room={room} big />
          <MadeBoard view={view} players={room.players} teams={room.room.teams} big />
          <p className="text-center text-[clamp(1rem,1.5vw,1.6rem)] font-semibold text-text-2">{rules.slice(0, 2).join(' ')}</p>
        </>
      )}
    </div>
  );
}
