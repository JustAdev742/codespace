import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ClassPhotoButton } from './ClassPhoto.tsx';
import { MODE_SCREENS } from './modes/registry.ts';
import { GameHouses } from '../school/GameHouses.tsx';
import { LessonResults, NextStepButton } from '../lessons/room.tsx';
import { Link, useNavigate } from 'react-router';
import { BookOpen, ClipboardList, Download, FastForward, Flame, Home, Rocket, RotateCcw, TrendingUp, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AwardView, Feeling, RoomView, StandingView } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { meKey, useMe } from '../../lib/session.ts';
import { ClassSummaryDialog, FEELING_INFO, Feelings } from './host/ClassSummary.tsx';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { duration, ordinal } from '../../lib/format.ts';
import { PLACE_BG, RankBadge, TeamScores } from './game/Leaderboard.tsx';
import { PlayerGlim, StagePanel, avatarOf, motionOK } from './game/stage.tsx';
import { Burst } from '../../art/bursts.tsx';
import { fxColors, fxShower } from '../../fx/index.ts';
import { useAnnounce } from './game/announce.tsx';
import { playSfx, useSharedSounds } from '../../lib/sound/react.tsx';
import { GameNextSteps } from '../making/GameNextSteps.tsx';
import { Rewards } from './Rewards.tsx';
import { FANFARE_LEAD_MS, ceremonyFor, ceremonyPace, endingKey, fanfareStarted, overStage, placeLands, placeTitle, sinceEnd, stageAt, winnerLands, type Beat, type Ceremony, type Stage } from './ceremony.ts';
import { focusAdrift } from '../../lib/focus.ts';

/** Block heights as a share of the tallest: first, second, third. */
const HEIGHT = [1, 0.72, 0.5];
/** Each place's Glim, name and score take this long to land. */
const LAND_MS = 220;
const ORDER = ['order-2', 'order-1', 'order-3'];
/** The winner's block rises slowly, in the curve of something travelling rather than arriving. */
const WINNER_RISE = 'cubic-bezier(0.77, 0, 0.175, 1)';

/**
 * The podium reveal, the game's last moment. Each block rises out of the floor, then its Glim, name
 * and score land on top, third place first; the winner's victory effect bursts as they land. Then
 * everything holds still while the teacher talks. `plan` is the ceremony's timeline (ceremony.ts),
 * `offset` how far into it this screen joined and `stage` where it has got to. With `offset` null (a
 * skipped or finished ceremony) everything is simply there.
 *
 * The moments are the room's; the movement is this device's. With less motion (the device's setting,
 * the player's, or a calm room) each place is simply there at its moment: nothing rises, lands or bursts.
 */
function Podium({ room, big, plan, offset, stage }: { room: RoomView; big: boolean; plan: Ceremony; offset: number | null; stage: Stage }) {
  const top = room.results!.standings.slice(0, 3);
  const moving = offset !== null && motionOK();
  const still = offset !== null && !moving;
  const vars = { '--podium': big ? 'clamp(8.5rem, 27vh, 19rem)' : '8.5rem' } as CSSProperties;
  // A screen that joined part-way starts each animation part-way too (a negative delay), so it is in step with the room.
  const at = (ms: number) => `${ms - (offset ?? 0)}ms`;
  const winner = plan.beats.find((b) => b.place === 0);
  return (
    <div className="relative flex w-full flex-col items-center" style={vars}>
      {/* The room's ceremony ends in a shower over the whole podium as the winner lands. */}
      {moving && winner && plan.pace === 'show' ? (
        <span className="pointer-events-none absolute inset-x-0 top-[38%]" aria-hidden>
          <Burst size={big ? 760 : 340} rise delay={winner.land + 80 - (offset ?? 0)} count={big ? 36 : 24} />
        </span>
      ) : null}
      <ol className="flex w-full items-end justify-center gap-[clamp(0.5rem,1.6vw,1.75rem)]" aria-label="Podium">
        {top.map((s, place) => {
          const a = avatarOf(room.players, s.playerId);
          const first = place === 0;
          const index = plan.beats.findIndex((b) => b.place === place);
          const beat = plan.beats[index];
          const rise = beat?.rise ?? 0;
          const land = beat?.land ?? 0;
          // Without movement a place keeps its room on the podium and is not there until its moment.
          const waiting = still && stage.landed <= index ? 'invisible' : '';
          return (
            <li key={s.playerId} className={`flex min-w-0 flex-col items-center ${ORDER[place]} ${big ? 'w-[clamp(7rem,13vw,16rem)]' : 'w-[6.75rem]'}`}>
              <div className={`relative flex w-full flex-col items-center ${waiting}`} style={moving ? { animation: `stage-land ${LAND_MS}ms var(--ease-out) ${at(land)} both` } : undefined}>
                <PlayerGlim avatar={a} seed={s.playerId} size={first ? 120 : 92} aura={first ? 'legendary' : null} pose={first ? 'cheer' : 'idle'} className={first ? (big ? 'size-[clamp(6rem,17vh,11.5rem)]' : 'size-[6rem]') : big ? 'size-[clamp(4.75rem,12.5vh,8.5rem)]' : 'size-[4.5rem]'} />
                {first ? <Burst style={a?.victory?.style ?? 'festival'} hue={a?.victory?.hue ?? 42} size={big ? 380 : 250} rise delay={moving ? land + 120 - (offset ?? 0) : 0} count={20} /> : null}
                {/* The winner's name is on gold; the runners-up on white. A long name takes a second line rather than lose its end. */}
                <span
                  className={`mt-1 line-clamp-2 max-w-full rounded-[var(--radius-s)] px-2.5 py-0.5 text-center leading-tight font-bold break-words shadow-[0_6px_16px_-8px_rgb(2_5_20/0.8)] ${big ? 'text-[clamp(1rem,1.6vw,1.75rem)]' : 'px-2 text-sm'} ${first ? 'bg-lantern text-on-accent' : 'paper'}`}
                >
                  {s.name}
                </span>
                {/* A long label ("12 points from 4 lanterns") wraps under itself, centred over the block. */}
                <span className={`mt-1 text-center font-display leading-tight font-extrabold tabular ${big ? 'text-[clamp(1.15rem,1.9vw,2.1rem)]' : 'text-lg'}`}>{s.label}</span>
              </div>
              <div className="mt-2 w-full overflow-hidden" style={{ height: `calc(var(--podium) * ${HEIGHT[place]})` }}>
                {/* A solid block with a lit top edge and a darker base, like the stage's pressable pieces. */}
                <div
                  className={`flex h-full w-full items-start justify-center rounded-t-[var(--radius-l)] pt-[clamp(0.25rem,1vh,0.75rem)] font-display leading-none font-extrabold text-on-accent italic shadow-[inset_0_3px_0_rgb(255_255_255/0.35),inset_0_-14px_0_rgb(0_0_0/0.14)] ${waiting}`}
                  style={{ background: PLACE_BG[place], animation: moving ? `stage-rise ${beat?.riseMs ?? 360}ms ${first && plan.pace === 'show' ? WINNER_RISE : 'var(--ease-out)'} ${at(rise)} both` : undefined }}
                >
                  <span className="text-[length:calc(var(--podium)*0.32)]">
                    <span className="sr-only">{ordinal(s.rank)} place</span>
                    <span aria-hidden>{s.rank}</span>
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {/* The stage floor the blocks rise out of. */}
      <div className="h-1.5 w-[min(100%,52rem)] rounded-full bg-white/25" aria-hidden />
    </div>
  );
}

/**
 * The big screen's caption while the podium is revealed: the place being named, then who took it, in
 * type the back of the room can read. Decoration for the eyes (the results are announced once, in
 * words, as the screen opens), so it is hidden from screen readers.
 */
function CeremonyCaption({ room, plan, stage }: { room: RoomView; plan: Ceremony; stage: Stage }) {
  const beat = stage.risen > 0 ? plan.beats[stage.risen - 1]! : null;
  const standing = beat ? room.results!.standings[beat.place] : null;
  const landed = beat !== null && stage.landed >= stage.risen;
  const plate = 'plate text-[clamp(1.75rem,3.2vw,3.75rem)]';
  // The plate keeps its place from one beat to the next: only what is under it changes. (The pop is on a
  // wrapper: a plate's lean is a transform of its own.)
  const pop = { animation: 'pop-in 220ms var(--ease-out) both' };
  return (
    // Tall enough for a name on two lines, so the Skip button under it never shifts from one place to the next.
    <div className="flex min-h-[clamp(15rem,50vh,32rem)] flex-col items-start gap-[clamp(0.5rem,1.6vh,1.25rem)] pt-[clamp(0.5rem,7vh,5rem)]" aria-hidden>
      {beat && standing ? (
        // Keyed by the place, so each one arrives fresh.
        <div key={beat.place} className="flex max-w-full min-w-0 flex-col items-start gap-[clamp(0.5rem,1.6vh,1.25rem)]">
          <div style={pop}>
            <p className={`${plate} text-on-accent`} style={{ background: PLACE_BG[beat.place] }}>
              <span>{placeTitle(room.results!.standings, beat.place, ordinal)}</span>
            </p>
          </div>
          {landed ? (
            <div className="flex max-w-full min-w-0 flex-col gap-1" style={{ animation: 'rise-fade 260ms var(--ease-out) both' }}>
              <p className="line-clamp-2 font-display text-[clamp(3rem,6.4vw,7.5rem)] leading-[0.95] font-extrabold break-words">{standing.name}</p>
              <p className="font-display text-[clamp(1.6rem,2.8vw,3.25rem)] leading-tight font-extrabold text-text-2 tabular">{standing.label}</p>
            </div>
          ) : (
            // The held breath before a name: three lights coming on, one after another.
            <p className="flex h-[clamp(3rem,6.4vw,7.5rem)] items-center gap-[clamp(0.5rem,1vw,1rem)]">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-[clamp(0.9rem,1.6vw,1.75rem)] rounded-full bg-white/70" style={motionOK() ? { animation: `drum-dot 900ms var(--ease-out) ${i * 180}ms infinite both` } : undefined} />
              ))}
            </p>
          )}
        </div>
      ) : (
        <div style={pop}>
          <p className={`${plate} plate-blue`}>
            <span>The podium</span>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Runs a ceremony's timeline on this screen: how far it has got, a way to skip it, and the moments
 * that have a sound. `startedAgo` is how long ago the game ended when the screen opened, so every
 * screen in the room is at the same point. With no plan, or a ceremony already over, there is nothing
 * to run and everything is on screen from the start.
 *
 * A room's ceremony runs whatever this device's motion setting, so every screen stays in step and
 * nobody's phone gives the winner away; less motion changes how the places appear, not when (Podium).
 * A solo game's quick reveal is only movement: with less motion it is simply over.
 */
function useCeremony(plan: Ceremony | null, startedAgo: number, on: { land?: (beat: Beat) => void; fanfare?: () => void }) {
  // Decided once, as the results open: a setting changed mid-ceremony does not restart it.
  const [offset] = useState<number | null>(() => (plan && startedAgo < plan.done && (plan.pace === 'show' || motionOK()) ? Math.max(0, startedAgo) : null));
  const [stage, setStage] = useState<Stage>(() => (plan && offset !== null ? stageAt(plan, offset) : overStage(plan)));
  const [skipped, setSkipped] = useState(false);
  const handlers = useRef(on);
  handlers.current = on;
  const fanfare = useRef(false);
  const playFanfare = useCallback(() => {
    if (fanfare.current) return;
    fanfare.current = true;
    handlers.current.fanfare?.();
  }, []);
  useEffect(() => {
    // No ceremony to wait for: the fanfare (if this screen has one) is due at once.
    if (!plan || offset === null) {
      playFanfare();
      return;
    }
    if (skipped) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      if (ms > offset) timers.push(setTimeout(fn, ms - offset));
    };
    plan.beats.forEach((b, i) => {
      at(b.rise, () => setStage((st) => ({ ...st, risen: Math.max(st.risen, i + 1) })));
      at(b.land, () => {
        setStage((st) => ({ ...st, risen: Math.max(st.risen, i + 1), landed: Math.max(st.landed, i + 1) }));
        handlers.current.land?.(b);
      });
    });
    const lead = winnerLands(plan) - (plan.pace === 'show' ? FANFARE_LEAD_MS : winnerLands(plan));
    if (lead > offset) timers.push(setTimeout(playFanfare, lead - offset));
    else playFanfare();
    at(plan.done, () => setStage(overStage(plan)));
    return () => timers.forEach(clearTimeout);
  }, [plan, offset, skipped, playFanfare]);
  const skip = useCallback(() => {
    setSkipped(true);
    setStage(overStage(plan));
    playFanfare();
  }, [plan, playFanfare]);
  return { stage, offset: skipped ? null : offset, running: !stage.done, skip };
}

/**
 * As the winner lands in a room's ceremony, paper falls: cannons and a shower across a big screen, a lighter
 * fall on a phone. Only where the stage's effects are up (fx/); the plain game keeps its burst and nothing more.
 */
function winnerShower(beat: Beat, big: boolean) {
  if (beat.place === 0) fxShower({ big, colors: fxColors(document.documentElement) });
}

/**
 * The podium ceremony on its own, for a second screen showing the game (features/school/Watch.tsx):
 * the same places at the same moments as the board and the phones, then `children` (that screen's own
 * lists), so a spare display never gives the winner away. A game with no ceremony shows `children` at once.
 */
export function PodiumCeremony({ room, receivedAt, children }: { room: RoomView; receivedAt: number; children: ReactNode }) {
  const pace = ceremonyPace(room, Boolean(MODE_SCREENS[room.room.modeId]?.Ending));
  const places = Math.min(3, room.results?.standings.length ?? 0);
  const plan = useMemo(() => (pace === 'show' ? ceremonyFor(places, pace) : null), [pace, places]);
  const [startedAgo] = useState(() => sinceEnd(room, receivedAt));
  const ceremony = useCeremony(plan, startedAgo, { land: (beat) => winnerShower(beat, true) });
  if (!plan || !ceremony.running) return <>{children}</>;
  return (
    <div className="grid w-full max-w-[100rem] flex-1 grid-cols-1 items-end gap-[clamp(1rem,2.5vw,2.5rem)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-h-[min(58vh,34rem)] flex-col justify-end">
        <Podium room={room} big plan={plan} offset={ceremony.offset} stage={ceremony.stage} />
      </div>
      <CeremonyCaption room={room} plan={plan} stage={ceremony.stage} />
    </div>
  );
}

/** Co-op endings: the whole room together, cheering a win or standing still after a loss. */
function TeamPhoto({ room, won, big }: { room: RoomView; won: boolean; big: boolean }) {
  const people = room.players.slice(0, 12);
  // Six fit one row beside the standings on a 1366-pixel projector, so nobody is left alone on a second row.
  const size = people.length <= 6 ? (big ? 'size-[clamp(4.5rem,min(15vh,6.8vw),10rem)]' : 'size-20') : big ? 'size-[clamp(3.5rem,min(10vh,5vw),7rem)]' : 'size-14';
  return (
    <div className="relative flex flex-wrap items-end justify-center gap-[clamp(0.25rem,1.2vw,1.25rem)] py-4" aria-hidden>
      {people.map((p, i) => (
        <span key={p.id} style={motionOK() ? { animation: `stage-arrive 220ms var(--ease-out) ${i * 40}ms both` } : undefined}>
          <PlayerGlim avatar={p.avatar} seed={p.id} size={120} pose={won ? 'cheer' : 'idle'} className={`${size} ${won ? '' : 'opacity-85'}`} />
        </span>
      ))}
      {won ? <Burst size={big ? 460 : 280} rise delay={400} count={20} /> : null}
    </div>
  );
}

function Standings({ room, big }: { room: RoomView; big: boolean }) {
  const team = (id: string | null) => room.room.teams.find((t) => t.id === id)?.name ?? null;
  // On the projector the list scrolls inside the space left beside the podium, so the host's buttons stay on screen.
  // Awards above it take their share of that space: without allowing for them the page grew taller than a
  // 1366 by 768 board by the height of the list, more with every player.
  const r = room.results!;
  const fit = r.teamStandings.length ? 'lg:max-h-[max(9rem,calc(100dvh-37rem))]' : r.awards?.length ? 'lg:max-h-[max(7.5rem,calc(100dvh-46rem))]' : 'lg:max-h-[max(12rem,calc(100dvh-28rem))]';
  return (
    <ol className={`flex flex-col gap-1.5 ${big ? `${fit} lg:overflow-y-auto lg:pr-1` : ''}`} aria-label="Final standings" tabIndex={big ? 0 : undefined}>
      {room.results!.standings.map((s: StandingView) => {
        const mine = s.playerId === room.me.playerId;
        const t = team(s.teamId);
        return (
          <li key={s.playerId} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[var(--radius-m)] px-2.5 py-1.5 ${big ? 'text-[clamp(1rem,1.25vw,1.4rem)]' : ''} ${mine ? 'bg-lantern/[0.14] ring-2 ring-lantern ring-inset' : 'bg-white/[0.07]'}`}>
            <RankBadge rank={s.rank} />
            <PlayerGlim avatar={avatarOf(room.players, s.playerId)} seed={s.playerId} size={44} className="shrink-0" />
            <span className="min-w-0 flex-1">
              {/* A long name is cut short; "(you)" after it never is. */}
              <span className="flex min-w-0 items-baseline font-bold">
                <span className="truncate">{s.name}</span>
                {/* A real space, so a screen reader does not run the name into "(you)". */}
                {mine ? <span className="shrink-0 text-[0.85em] font-semibold whitespace-pre text-text-2"> (you)</span> : null}
              </span>
              <span className="block truncate text-sm text-text-2">
                {s.correct} of {s.answered} right{t ? `, ${t}` : ''}
              </span>
            </span>
            {/* On a phone a long result ("4,500 points, 36 correct") takes its own line, so the name is not cut short. */}
            <span className={`max-w-[48%] text-right font-display leading-tight font-extrabold tabular ${s.label.length > 12 ? `text-[1.05em] ${big ? '' : 'max-sm:max-w-none max-sm:basis-full'}` : 'shrink-0 text-[1.3em]'}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const AWARD_INFO: Record<AwardView['kind'], { title: string; Icon: typeof Flame }> = {
  streak: { title: 'Longest streak', Icon: Flame },
  fastest: { title: 'Fastest right answer', Icon: Zap },
  improved: { title: 'Most improved', Icon: TrendingUp },
  comeback: { title: 'Best comeback', Icon: Rocket },
};

/** Awards beyond the podium, worked out on the server from the answers. */
function Awards({ awards, big, me }: { awards: AwardView[]; big: boolean; me: string | null }) {
  if (!awards.length) return null;
  return (
    <section aria-labelledby="awards-title">
      <h2 id="awards-title" className={`mb-2 font-display font-bold ${big ? 'text-[clamp(1.5rem,2vw,2.25rem)]' : 'text-2xl'}`}>
        Awards
      </h2>
      <ul className={`grid gap-2 ${big ? 'grid-cols-2' : 'grid-cols-1 min-[420px]:grid-cols-2'}`}>
        {awards.map((a) => {
          const { title, Icon } = AWARD_INFO[a.kind];
          const mine = a.playerId === me;
          return (
            <li key={a.kind} className={`flex min-w-0 items-center gap-3 rounded-[var(--radius-m)] px-3 py-2 ${mine ? 'bg-lantern/[0.14] ring-2 ring-lantern ring-inset' : 'bg-white/[0.07]'}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lantern text-on-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-2">{title}</span>
                <span className={`block truncate font-bold ${big ? 'text-[clamp(1.05rem,1.3vw,1.4rem)]' : ''}`}>
                  {a.name}
                  {mine ? <span className="font-semibold text-text-2"> (you)</span> : null}
                </span>
                <span className="block text-sm text-text-2">{a.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The player's own end-of-game card, worth a screenshot: their Glim on a lit spot, their place on the gold
 * plate, then the numbers that matter (score, accuracy, right answers) and any award they took.
 */
function EndCard({ room, mine, awards, lone = false }: { room: RoomView; mine: StandingView; awards: AwardView[]; lone?: boolean }) {
  const accuracy = mine.answered ? Math.round((mine.correct / mine.answered) * 100) : 0;
  // On their own, a player has no place to come: the card is their result, and they cheer for getting most of it right.
  const podiumPlace = lone ? accuracy >= 50 : mine.rank <= 3;
  const stats = [
    { label: 'Result', value: mine.label },
    { label: 'Accuracy', value: `${accuracy}%` },
    { label: 'Right', value: `${mine.correct} of ${mine.answered}` },
  ];
  return (
    <section aria-labelledby="end-card-title" className="relative isolate overflow-hidden rounded-[var(--radius-l)] bg-[color-mix(in_srgb,var(--stage-1)_90%,#ffffff)] px-5 pt-5 pb-4 shadow-[0_14px_36px_-12px_rgb(2_5_20/0.7)]" style={motionOK() ? { animation: 'pop-in 220ms var(--ease-out)' } : undefined}>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_90%_at_50%_0%,rgb(255_194_51/0.28),transparent_70%)]" aria-hidden />
      <div className="flex items-center gap-4">
        <PlayerGlim avatar={avatarOf(room.players, mine.playerId)} seed={mine.playerId} size={104} pose={podiumPlace ? 'cheer' : 'idle'} aura={mine.rank === 1 && !lone ? 'legendary' : null} className="shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h2 id="end-card-title" className="plate plate-gold text-[1.8rem] whitespace-nowrap">
            <span>{lone ? 'Your result' : `You came ${ordinal(mine.rank)}`}</span>
          </h2>
          <p className="max-w-full truncate font-semibold text-text-2">{lone ? mine.name : `${mine.name}, of ${room.results!.standings.length}`}</p>
        </div>
      </div>
      {/* The result has a row to itself: a mode's own wording ("Survived, 2,000 pts") stays on one line on a phone. */}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {stats.map((st, i) => (
          <div key={st.label} className={`flex min-w-0 flex-col rounded-[var(--radius-m)] bg-[var(--stage-3)] px-3 py-2 ${i === 0 ? 'col-span-2' : ''}`}>
            <dt className="text-sm font-semibold text-text-2">{st.label}</dt>
            <dd className={`font-display leading-tight font-extrabold break-words tabular ${i === 0 ? 'text-[2rem]' : 'text-[1.6rem]'}`}>{st.value}</dd>
          </div>
        ))}
      </dl>
      {awards.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {awards.map((a) => {
            const { title, Icon } = AWARD_INFO[a.kind];
            return (
              <li key={a.kind} className="inline-flex items-center gap-1.5 rounded-full bg-lantern px-3 py-1 text-sm font-bold text-on-accent">
                {/* Alone, nobody was beaten to it: the chip says what the player did ("6 right in a row"). */}
                <Icon className="size-4" aria-hidden /> {lone ? a.detail : title}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** The exit ticket on a player's device: one tap, three faces. The teacher sees only the counts. */
function ExitTicket({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const chosen = room.me.feeling ?? null;
  const choose = async (feeling: Feeling) => {
    const ack = await handle.player({ op: 'feeling', feeling });
    if (!ack.ok) toast.error(ack.error.message);
  };
  return (
    <section className="paper stage-card flex flex-col gap-3 px-5 py-4" aria-labelledby="exit-title">
      <h2 id="exit-title" className="font-display text-[1.75rem] leading-tight font-bold">
        How did that feel?
      </h2>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="exit-title">
        {(Object.keys(FEELING_INFO) as Feeling[]).map((f) => {
          const { label, Icon } = FEELING_INFO[f];
          const on = chosen === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void choose(f)}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-[var(--radius-l)] font-bold ${on ? 'sticker bg-lantern text-on-accent' : 'press-soft bg-surface-2 text-text hover:bg-surface-3'}`}
            >
              <Icon className="size-8" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-text-2" aria-live="polite">
        {chosen ? 'Thanks. Your teacher sees how many chose each face, never who chose what.' : 'One tap. Your teacher sees only how many chose each face.'}
      </p>
    </section>
  );
}

/** After the game on a player's device: practise the same questions alone, in a solo game. */
function PracticeButton({ room }: { room: RoomView }) {
  const [busy, setBusy] = useState(false);
  const signedIn = Boolean(useMe().data?.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = room.me.reconnectToken;
  if (!token || room.room.solo) return null;
  const start = async () => {
    setBusy(true);
    try {
      // Not signed in: a guest account (one tap, no email) holds the solo game.
      if (!signedIn) {
        await api.post('/api/auth/guest', {});
        await qc.invalidateQueries({ queryKey: meKey });
      }
      const res = await api.post<{ code: string }>(`/api/rooms/${room.room.code}/practice`, { reconnectToken: token });
      navigate(`/room/${res.code}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start a practice game. Try again.');
      setBusy(false);
    }
  };
  return (
    <Button size="lg" variant="primary" icon={<BookOpen className="size-5" aria-hidden />} loading={busy} onClick={() => void start()}>
      Practise these questions on your own
    </Button>
  );
}

function downloadCsv(room: RoomView) {
  const r = room.results!;
  const team = (id: string | null) => room.room.teams.find((t) => t.id === id)?.name ?? '';
  const rows = [['Rank', 'Name', 'Team', 'Result', 'Correct', 'Answered', 'Accuracy'], ...r.standings.map((s) => [s.rank, s.name, team(s.teamId), s.label, s.correct, s.answered, s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : ''])];
  // Quote every cell and neutralise spreadsheet formulas in player names.
  const cell = (v: unknown) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const blob = new Blob([rows.map((row) => row.map(cell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ludora-${room.room.code}-results.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Results({ room, handle, isHost, guest }: { room: RoomView; handle: RoomHandle; isHost: boolean; guest: boolean }) {
  const [busy, setBusy] = useState(false);
  const r = room.results!;
  const mine = r.standings.find((s) => s.playerId === room.me.playerId);
  const competitive = r.outcome === 'competitive';
  // A mode may open its results on a picture of its own (Glim Garden: the garden the class grew), and may hide the table.
  const Ending = MODE_SCREENS[room.room.modeId]?.Ending ?? null;
  const tableHidden = MODE_SCREENS[room.room.modeId]?.tableHidden?.(room) ?? false;
  const pace = ceremonyPace(room, Boolean(Ending));
  const podium = pace !== null;
  // Something stands beside the standings: the podium, or the team photo of a co-op game. A lone player has neither.
  const side = podium || !competitive || Boolean(Ending);
  // A mode with its own ending is never "lost": nobody loses anything in it.
  const title = r.outcome === 'coop-win' ? 'Victory' : r.outcome === 'coop-loss' && !Ending ? 'Defeat' : 'Game over';
  useAnnounce(`${title}. ${mine && podium ? `You came ${ordinal(mine.rank)}. ` : ''}${r.summary}`, 'results');
  const shared = useSharedSounds();
  const big = isHost;
  const places = Math.min(3, r.standings.length);
  const plan = useMemo(() => (pace ? ceremonyFor(places, pace) : null), [pace, places]);
  // Where this player stands on the podium (0 for the winner), or null if they are not on it.
  const myPlace = mine ? r.standings.slice(0, places).findIndex((s) => s.playerId === mine.playerId) : -1;
  const key = endingKey(room);
  // Fixed as the screen opens: how long ago the game ended by the server's clock, so every screen is at the same point.
  const [startedAgo] = useState(() => sinceEnd(room, handle.receivedAt));
  const ceremony = useCeremony(plan, startedAgo, {
    // The shared screen marks second and third place as they land in a room's ceremony.
    land: (beat) => {
      if (shared && beat.place !== 0 && plan?.pace === 'show') playSfx('rankUp');
      if (plan?.pace === 'show') winnerShower(beat, big);
    },
    // The shared screen celebrates as the winner lands, unless the class lost a co-op game: then a gentle sting, not a
    // fanfare. (A phone's own moment is below.)
    fanfare: () => {
      if (shared) playSfx(r.outcome === 'coop-loss' ? (Ending ? 'reveal' : 'lose') : 'fanfare');
      fanfareStarted(key);
    },
  });
  const { stage } = ceremony;
  // A room's ceremony can be skipped by the host: with the button, or Escape.
  const canSkip = ceremony.running && isHost && plan?.pace === 'show';
  const skip = ceremony.skip;
  useEffect(() => {
    if (!canSkip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSkip, skip]);
  const restart = async () => {
    setBusy(true);
    const ack = await handle.host({ cmd: 'restart' });
    setBusy(false);
    if (!ack.ok) toast.error(ack.error.message);
  };
  const [summary, setSummary] = useState(false);
  const feelings = room.host?.feelings ?? null;
  // The Skip button goes when the ceremony does. If it had the focus, the host's next step takes it, so a
  // keyboard is never left at the top of the page.
  const nextSteps = useRef<HTMLDivElement>(null);
  const running = ceremony.running;
  useEffect(() => {
    if (running || !isHost) return;
    if (focusAdrift()) nextSteps.current?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
  }, [running, isHost]);
  // A player who played on their own (a solo game, or the only one in the room): their card is their result, and a
  // table of one is left out. In a solo game so are awards "won" against nobody; in a host's room the awards are
  // the room's, on the big screen too, so the player's screen keeps them. The big screen keeps its table.
  const lone = !isHost && competitive && r.standings.length === 1;
  const soloAwards = lone && room.room.solo;
  // What waits for the ceremony: the rest of the results. A solo game's quick reveal holds only its standings and awards.
  const held = ceremony.running && plan?.pace === 'show';
  const heldBrisk = ceremony.running && plan?.pace === 'brisk';
  // A player's own card lands with their place on the podium, and for everyone else when the ceremony is over.
  const myLand = plan && myPlace >= 0 ? placeLands(plan, myPlace) : null;
  const myCard = !held || (myLand !== null && stage.landed > plan!.beats.findIndex((b) => b.place === myPlace));
  // A phone's own moment, heard once as its player's result arrives: the winner's celebrates, a podium place
  // chimes up, and everyone else hears the same soft chime the results always had.
  useEffect(() => {
    if (shared || !myCard) return;
    playSfx(!plan || myPlace < 0 ? 'reveal' : myPlace === 0 ? 'win' : 'rankUp');
    // Once: when the card arrives.
  }, [shared, myCard]); // eslint-disable-line react-hooks/exhaustive-deps
  // Things that arrive after the ceremony settle in, rather than snap on.
  const arrive = plan && ceremony.offset !== null ? { animation: 'rise-fade 280ms var(--ease-out) both' } : undefined;
  return (
    <div className={`mx-auto flex w-full flex-1 flex-col ${big ? 'max-w-[112rem] gap-[clamp(1rem,3vh,2rem)]' : 'max-w-3xl gap-6'}`}>
      <div className="flex flex-col items-center text-center">
        <h1 className={`font-display leading-[0.92] font-extrabold ${big ? 'text-[clamp(3.5rem,6.2vw,7.5rem)]' : 'text-[3.5rem]'}`}>{title}</h1>
        <p className={`mt-2 font-semibold text-text-2 ${big ? 'text-[clamp(1.1rem,1.6vw,1.8rem)]' : 'text-lg'}`}>{r.summary}</p>
        {mine && r.standings.length > 1 && competitive && big && !held ? (
          <p className={`plate plate-gold mt-3 ${big ? 'text-[clamp(1.75rem,2.6vw,3rem)]' : 'text-[2rem]'}`}>
            <span>You came {ordinal(mine.rank)}</span>
          </p>
        ) : null}
      </div>
      {/* With nothing to stand beside them, a lone player's standings take the middle of the projector rather than leave half of it empty. */}
      <div className={`grid grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] ${big ? (side ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start' : 'mx-auto w-full max-w-[48rem]') : ''}`}>
        {/* On the projector the podium stays in view, standing on the bottom of the screen, however long the standings get. */}
        {side ? (
          <div className={`relative flex flex-col ${podium ? 'justify-end' : 'justify-center'} ${big ? 'lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-19.5rem)] lg:min-h-[22rem]' : ''}`}>
            {Ending ? (
              <Suspense fallback={null}>
                <Ending room={room} big={big} />
              </Suspense>
            ) : plan ? (
              <Podium key={ceremony.offset === null ? 'over' : 'live'} room={room} big={big} plan={plan} offset={ceremony.offset} stage={stage} />
            ) : (
              <TeamPhoto room={room} won={r.outcome === 'coop-win'} big={big} />
            )}
          </div>
        ) : null}
        {held && big && plan ? (
          // The big screen during the ceremony: the caption for the place being revealed, and a way past it for a teacher in a hurry.
          <div className="flex flex-col gap-4">
            <CeremonyCaption room={room} plan={plan} stage={stage} />
            {canSkip ? (
              <Button size="sm" variant="ghost" className="self-start" icon={<FastForward className="size-4" aria-hidden />} onClick={skip} title="Skip to the winner (Esc)" aria-keyshortcuts="Escape">
                Skip to the winner
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4" style={big ? arrive : undefined}>
            {isHost ? (
              // The host's next steps come first, so they stay on screen however long the standings are.
              <div ref={nextSteps} className="host-next paper stage-card flex flex-wrap items-center gap-2 p-3" role="group" aria-label="What next">
                {/* Lessons: the next step with the same players comes first. */}
                {room.lesson ? <NextStepButton room={room} className="grow" /> : null}
                <Button variant={room.lesson ? 'secondary' : 'primary'} size="lg" className="grow" icon={<RotateCcw className="size-5" aria-hidden />} loading={busy} onClick={restart}>
                  Play again with the same players
                </Button>
                {r.report ? (
                  <Button size="lg" className="grow" icon={<ClipboardList className="size-5" aria-hidden />} onClick={() => setSummary(true)}>
                    Class summary
                  </Button>
                ) : null}
                {r.gameId && !room.room.solo ? <GameNextSteps gameId={r.gameId} /> : null}
                <Button size="lg" className="grow" icon={<Download className="size-5" aria-hidden />} onClick={() => downloadCsv(room)}>
                  Download results (CSV)
                </Button>
                <ClassPhotoButton room={room} />
                <Link to="/host" className={buttonClass('ghost', 'lg', 'grow')}>
                  Host something else
                </Link>
                {feelings ? (
                  <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-2">
                    <span className="text-sm font-semibold text-text-2">How it felt so far:</span>
                    <Feelings counts={feelings} />
                  </div>
                ) : null}
                <ClassSummaryDialog room={room} open={summary} onOpenChange={setSummary} />
              </div>
            ) : (
              <>
                {held && !myCard ? <DrumRoll /> : null}
                {mine && competitive && myCard ? <EndCard room={room} mine={mine} lone={lone} awards={held ? [] : (r.awards ?? []).filter((a) => a.playerId === room.me.playerId)} /> : null}
                {held ? null : (
                  <div className="flex flex-col gap-4" style={arrive}>
                    <Rewards rewards={room.rewards} guest={guest} />
                    {room.room.options.exitTicket && !room.room.solo ? <ExitTicket room={room} handle={handle} /> : null}
                  </div>
                )}
              </>
            )}
            {held || heldBrisk ? null : (
              <div className="flex flex-col gap-4" style={big ? undefined : arrive}>
                {r.awards?.length && !soloAwards ? <Awards awards={r.awards} big={big} me={room.me.playerId} /> : null}
                {r.teamStandings.length && !tableHidden ? (
                  <StagePanel as="section" className="p-4" label="Teams">
                    <h2 className="mb-3 font-display text-2xl font-bold">Teams</h2>
                    <TeamScores teams={r.teamStandings.map((t) => ({ teamId: t.teamId, name: t.name, score: t.score, hue: room.room.teams.find((x) => x.id === t.teamId)?.hue ?? 42 }))} />
                  </StagePanel>
                ) : null}
                {/* School: house points this game earned, by house (features/school). */}
                {room.room.solo ? null : <GameHouses gameId={r.gameId} />}
                {/* Lessons: points across the whole lesson so far. */}
                <LessonResults room={room} isHost={isHost} />
                {tableHidden || lone ? null : <Standings room={room} big={big} />}
                <p className="text-sm font-semibold text-text-2">Played for {duration(r.durationMs)}.</p>
              </div>
            )}
            {isHost ? null : room.room.solo ? (
              // A solo player is their own host: they can go again straight away. On a phone the way on stays at the
              // foot of the screen however long the rewards above it are.
              <>
                <Link to="/" className={buttonClass('ghost', 'lg', 'sm:hidden')}>
                  <Home className="size-5" aria-hidden /> Back to home
                </Link>
                <div className="results-next flex flex-wrap gap-2" role="group" aria-label="What next">
                  <Button variant="primary" size="lg" className="grow" icon={<RotateCcw className="size-5" aria-hidden />} loading={busy} onClick={restart}>
                    Play again
                  </Button>
                  <Link to="/host?solo=1" className={buttonClass('secondary', 'lg', 'grow')}>
                    Try another mode
                  </Link>
                  <Link to="/" className={buttonClass('ghost', 'lg', 'grow max-sm:hidden')}>
                    <Home className="size-5" aria-hidden /> Back to home
                  </Link>
                </div>
              </>
            ) : held ? null : (
              <div className="flex flex-col gap-2" style={arrive}>
                <PracticeButton room={room} />
                <Link to="/" className={buttonClass('secondary', 'lg')}>
                  <Home className="size-5" aria-hidden /> Back to home
                </Link>
                <p className="text-center text-sm font-semibold text-text-2">If the host starts another round, you will join it from here.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** On a phone while the podium is revealed: the player's result is on its way, and the board is the place to look. */
function DrumRoll() {
  return (
    <StagePanel className="flex flex-col items-center gap-1 px-5 py-5 text-center" as="div">
      <p className="font-display text-[1.75rem] leading-tight font-extrabold">Who made the podium?</p>
      <p className="font-semibold text-text-2">Watch the places come in. Your result is next.</p>
    </StagePanel>
  );
}
