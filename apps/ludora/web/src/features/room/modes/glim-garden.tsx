import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Droplet, Flower2, Gift, Moon, Shrub, Sparkles, Sprout, Sun, TreeDeciduous } from 'lucide-react';
import type { Answer, RoomView } from '@ludora/shared';
import { PLANTS, type Kind, type PlotView } from '@ludora/engine/glim-garden';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard } from '../game/Leaderboard.tsx';
import { ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx, useSfx } from '../../../lib/sound/react.tsx';
import { Stage3D, lookFor, type GlimLook } from '../../../three/index.ts';
import { GardenHostScene, GardenScene, type GardenSceneState } from './glim-garden-scene.ts';
import { GardenMap, type MapGarden } from './glim-garden-map.tsx';
import { KIND_WORD, dropsText, dropsToGo, firefliesText, hostPicture, playerPicture } from './glim-garden-words.ts';

/*
 * Glim Garden screens. The garden is the picture; everything you do is an
 * ordinary, large button beside it: plant one of three seeds, water your own
 * plant, or give a drop to a neighbour (the one who needs it most comes
 * first). With 3D off a drawn garden shows the same plots. What is growing
 * and what just happened are said in words. The words stay short, for young
 * readers.
 */

/* ---------------------------------- types --------------------------------- */

interface GardenRow {
  teamId: string | null;
  goal: number;
  glowing: number;
  fireflies: number;
  full: boolean;
  plots: PlotView[];
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  points: number;
  blooms: number;
  gifts: number;
  rank: number;
  isYou: boolean;
}

interface NewsRow {
  id: number;
  at: number;
  text: string;
  garden: number;
}

type Why = 'drooping' | 'nearly' | 'growing';

interface You {
  garden: number;
  drops: number;
  maxDrops: number;
  points: number;
  blooms: number;
  fireflies: number;
  gifts: number;
  helped: number;
  received: number;
  rank: number | null;
  neighbours: string[];
  giftTo: { id: string; why: Why; glowing: boolean }[];
  canPlant: boolean;
  canWater: boolean;
  asleep: boolean;
  notes: { id: number; at: number; text: string; tone: 'good' | 'info' }[];
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
}

export interface GardenView {
  gardens: GardenRow[];
  plotFireflies: number;
  endsAt: number | null;
  nightBloom: boolean;
  dark: boolean;
  phaseEndsAt: number | null;
  droop: boolean;
  showTable: boolean;
  ending: boolean;
  players: number;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; points: number; fireflies: number | null; glowing: number | null; goal: number | null }[] | null;
  news?: NewsRow[];
  gifts?: number;
  blooms?: number;
  you?: You | null;
}

/* ---------------------------------- helpers -------------------------------- */

const KIND_ICON: Record<Kind, typeof Flower2> = { flower: Flower2, bush: Shrub, tree: TreeDeciduous };
const WHY_WORD: Record<Why, string> = { drooping: 'Drooping', nearly: 'Nearly open', growing: 'Growing' };

function useNames(room: RoomView) {
  return useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players]);
}

function useLooks(room: RoomView): Map<string, GlimLook> {
  return useMemo(() => new Map(room.players.map((p) => [p.id, lookFor(p.avatar, fallbackArt(p.id))])), [room.players]);
}

function teamName(room: RoomView, teamId: string | null): string | null {
  return teamId ? (room.room.teams.find((t) => t.id === teamId)?.name ?? null) : null;
}

function sceneState(view: GardenView, room: RoomView, looks: Map<string, GlimLook>, names: Map<string, string>): GardenSceneState {
  return { gardens: view.gardens.map((g) => ({ teamId: g.teamId, name: teamName(room, g.teamId), plots: g.plots })), need: view.plotFireflies, dark: view.dark, nightBloom: view.nightBloom, looks, names };
}

function mapGardens(view: GardenView, room: RoomView): MapGarden[] {
  return view.gardens.map((g) => ({ teamId: g.teamId, name: view.gardens.length > 1 ? teamName(room, g.teamId) : null, plots: g.plots }));
}

/** Three drops in a can: the ones you hold, filled. */
function Drops({ n, max, big = false }: { n: number; max: number; big?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} of ${max} drops in your can`}>
      {Array.from({ length: max }, (_, i) => (
        <Droplet key={i} className={`${big ? 'size-6' : 'size-5'} ${i < n ? 'fill-[#8fd3ff] text-[#8fd3ff]' : 'text-white/45'}`} aria-hidden />
      ))}
    </span>
  );
}

/** How full the garden is: glowing plots against the goal, as a bar and in numbers. */
function GoalBar({ glowing, goal, fireflies, big = false, name = null }: { glowing: number; goal: number; fireflies: number; big?: boolean; name?: string | null }) {
  const pct = Math.min(100, Math.round((glowing / Math.max(1, goal)) * 100));
  const full = glowing >= goal;
  return (
    <div className={`flex flex-col gap-1 ${big ? 'text-[clamp(1rem,1.5vw,1.6rem)]' : 'text-sm'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold">{name ? `${name}: ` : ''}{full ? 'Garden full!' : 'Glowing plots'}</span>
        <span className="font-display font-extrabold tabular">
          <span className={big ? 'text-[1.6em]' : 'text-lg'}>{glowing}</span> of {goal}
        </span>
      </div>
      <div className={`overflow-hidden rounded-full bg-white/[0.12] ${big ? 'h-3' : 'h-2'}`} role="progressbar" aria-label={`${name ? `${name}: ` : ''}glowing plots`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(glowing, goal)} aria-valuetext={`${glowing} of ${goal} plots glowing`}>
        <div className={`h-full rounded-full ${full ? 'bg-glim' : 'bg-lantern'}`} style={{ width: `${pct}%`, transition: 'width 220ms var(--ease-out)' }} />
      </div>
      <span className="text-text-2">
        <Sparkles className="mr-1 inline size-[1em] text-lantern" aria-hidden />
        {firefliesText(fireflies)} so far
      </span>
    </div>
  );
}

/** Morning's clock, and night or day in Night Bloom. */
function Clock({ view, gameNow, big = false }: { view: GardenView; gameNow: () => number; big?: boolean }) {
  return (
    <span className={`flex flex-wrap items-center gap-2 ${big ? 'text-[clamp(1.05rem,1.7vw,1.9rem)]' : 'text-sm'}`}>
      {view.nightBloom && view.phaseEndsAt !== null ? (
        <Pill tone={view.dark ? 'dusk' : 'lantern'} className={big ? 'px-4 py-1' : ''}>
          {view.dark ? <Moon className="size-[1em]" aria-hidden /> : <Sun className="size-[1em]" aria-hidden />}
          {view.dark ? 'Night' : 'Day'}
          <Countdown until={view.phaseEndsAt} gameNow={gameNow} label={view.dark ? 'Day comes in' : 'Night comes in'} />
        </Pill>
      ) : null}
      {view.endsAt !== null ? (
        <Pill className={big ? 'px-4 py-1' : ''}>
          <Sun className="size-[1em] text-lantern" aria-hidden /> Morning in <Countdown until={view.endsAt} gameNow={gameNow} label="Morning comes in" />
        </Pill>
      ) : (
        <Pill className={big ? 'px-4 py-1' : ''}>No clock</Pill>
      )}
    </span>
  );
}

/** A big, plain action button: an icon, a short label and a line under it. */
/**
 * The name a screen reader hears is the visible words with a few hidden ones in between, so it reads as a
 * sentence and always contains what is on the button: `before` + label + `mid` + sub + `after`.
 */
function Action({ icon, label, sub, onClick, disabled, tone = 'calm', sr = {}, highlight = false, tile = false }: { icon: ReactNode; label: string; sub: string; onClick: () => void; disabled: boolean; tone?: 'calm' | 'water' | 'gift'; sr?: { before?: string; mid?: string; after?: string }; highlight?: boolean; tile?: boolean }) {
  const fill = tone === 'water' ? 'bg-[#8fd3ff] text-on-accent' : tone === 'gift' ? 'bg-lantern text-on-accent' : 'bg-white/[0.1] text-text hover:bg-white/[0.16]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-0 rounded-[var(--radius-l)] ${tile ? 'min-h-24 flex-col items-center justify-center gap-1 px-1.5 py-2 text-center' : 'min-h-16 items-center gap-3 px-3 py-2 text-left'} shadow-[inset_0_-4px_0_rgb(0_0_0/0.22)] transition-[transform,background-color] duration-150 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${fill} ${highlight ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--stage,#0a0f2c)]' : ''}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/15" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block font-display leading-tight font-extrabold ${tile ? 'text-lg' : 'truncate text-xl'}`}>
          {sr.before ? <span className="sr-only">{sr.before}</span> : null}
          {label}
          <span className="sr-only">{sr.mid ?? ': '}</span>
        </span>
        <span className="block text-sm leading-tight font-semibold opacity-85">
          {sub}
          <span className="sr-only">{sr.after ?? '.'}</span>
        </span>
      </span>
    </button>
  );
}

/* --------------------------------- player --------------------------------- */

export function GlimGardenPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<GardenView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [said, setSaid] = useState<{ text: string; key: number } | null>(null);
  const scene = useRef<GardenScene | null>(null);
  const names = useNames(room);
  const looks = useLooks(room);
  const me = room.me.playerId ?? '';
  const garden = you ? view.gardens[you.garden] : undefined;
  const state = useMemo(() => sceneState(view, room, looks, names), [view, room, looks, names]);
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  const onWorld = useCallback(
    (w: GardenScene | null) => {
      scene.current = w;
      w?.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const topNote = you?.notes[0] ?? null;
  // Notes are what happened to you (a gift, a bloom, a droop), said once each.
  useAnnounce(topNote?.text ?? null, topNote?.id ?? null);
  useAnnounce(said?.text ?? null, said?.key ?? null);
  useSfx(topNote?.tone === 'good' ? 'rankUp' : 'tap', topNote?.id ?? null, Boolean(topNote));
  useSfx('win', garden?.full ? 'full' : null, Boolean(garden?.full));

  if (!you || !garden) return <p className="font-semibold text-text-2">Watching the garden grow.</p>;

  const mine = garden.plots.find((p) => p.id === me)!;
  const plots = new Map(garden.plots.map((p) => [p.id, p]));
  const neighbours = you.neighbours.map((id) => ({ plot: plots.get(id)!, name: names.get(id) ?? 'A player' })).filter((n) => n.plot);
  const label = playerPicture({ mine, neighbours, need: view.plotFireflies, glowing: garden.glowing, goal: garden.goal, asleep: you.asleep, dark: view.nightBloom ? view.dark : null });

  const send = async (a: unknown, done: string) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
    if (ack.ok) setSaid({ text: done, key: Date.now() });
    return ack.ok;
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const empty = you.drops <= 0;
  const off = empty || paused || busy;
  const left = dropsToGo(mine);
  const word = mine.k ? KIND_WORD[mine.k] : 'plant';
  const keepTree = mine.k === 'tree' && mine.b === 1 && neighbours.length > 0;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="Your plot">
        <div className="relative">
          <Stage3D<GardenScene>
            label={label}
            create={(env) => new GardenScene(env, me)}
            onWorld={onWorld}
            className="h-[26vh] min-h-[190px] rounded-[var(--radius-l)] sm:h-[38vh] lg:h-[44vh]"
            fallback={<GardenMap gardens={mapGardens(view, room)} need={view.plotFireflies} me={me} names={(id) => names.get(id) ?? 'A player'} dark={view.dark} nightBloom={view.nightBloom} label={label} className="h-full w-full" />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap items-center gap-1.5">
            <span className="flex items-center rounded-[var(--radius-m)] bg-black/60 px-2 py-1 backdrop-blur-sm">
              <Drops n={you.drops} max={you.maxDrops} />
            </span>
            <span className="flex items-center gap-1 rounded-[var(--radius-m)] bg-black/60 px-2 py-1 text-sm font-bold text-white backdrop-blur-sm">
              <Sparkles className="size-4 text-lantern" aria-hidden />
              <span className="tabular">{Math.min(mine.j, 99)}</span>
              <span className="sr-only">fireflies at your plot,</span>
              <span aria-hidden>/</span>
              <span className="tabular">{view.plotFireflies}</span>
              <span className="sr-only">make it glow</span>
            </span>
          </div>
          {/* On a phone the goal and the clock sit on the picture, so the question and the buttons stay close. */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1.5 lg:hidden">
            <span className="flex items-center gap-1 rounded-[var(--radius-m)] bg-black/65 px-2 py-1 text-sm font-bold text-white backdrop-blur-sm">
              <Sprout className="size-4 text-glim" aria-hidden /> {garden.full ? 'Garden full!' : `Glowing ${garden.glowing} of ${garden.goal}`}
            </span>
            <span className="rounded-[var(--radius-m)] bg-black/65 px-2 py-1 text-sm font-bold text-white backdrop-blur-sm">
              {view.endsAt !== null ? (
                <>
                  Morning <Countdown until={view.endsAt} gameNow={gameNow} label="Morning comes in" />
                </>
              ) : (
                'No clock'
              )}
            </span>
            {view.nightBloom ? (
              <span className="flex items-center gap-1 rounded-[var(--radius-m)] bg-black/65 px-2 py-1 text-sm font-bold text-white backdrop-blur-sm">
                {view.dark ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4 text-lantern" aria-hidden />} {view.dark ? 'Night' : 'Day'}
              </span>
            ) : null}
          </div>
        </div>
        {topNote ? (
          <p className={`w-fit max-w-full rounded-[var(--radius-m)] px-3 py-1.5 text-sm font-bold ${topNote.tone === 'good' ? 'bg-lantern text-on-accent' : 'bg-white/[0.1] text-text'}`} aria-hidden>
            {topNote.text}
          </p>
        ) : null}
        <StagePanel className="flex flex-col gap-2 p-2.5" as="section" label="What to do with a drop">
          <h3 className="font-display text-lg font-extrabold">{empty ? 'Answer to fill your can' : you.canPlant ? (mine.k ? 'Plant again' : 'Plant a seed') : 'Use a drop'}</h3>
          {you.canPlant ? (
            <>
              {keepTree ? <p className="text-sm text-text-2">Your lantern tree lights your neighbours. Planting again takes it away.</p> : null}
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Plant a seed">
                {(['flower', 'bush', 'tree'] as const).map((k) => {
                  const Icon = KIND_ICON[k];
                  const info = PLANTS[k];
                  return (
                    <Action
                      key={k}
                      tile
                      icon={<Icon className="size-6" aria-hidden />}
                      label={info.label}
                      sub={`${dropsText(info.need)}, ${firefliesText(info.fireflies)}`}
                      sr={{ before: 'Plant a ', after: k === 'tree' ? ', and it lights the plots next to it.' : '.' }}
                      disabled={off}
                      onClick={() => {
                        playSfx('build');
                        void send({ type: 'plant', kind: k }, `You planted a ${KIND_WORD[k]} seed.`);
                      }}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <Action
              tone="water"
              icon={<Droplet className="size-6" aria-hidden />}
              label={`Water your ${word}`}
              sub={you.asleep ? 'Flowers sleep in the day' : left === 1 ? '1 more drop: it opens!' : `${dropsText(left)} to go${mine.d ? ', drooping' : ''}`}
              sr={{ after: you.asleep ? '. Wait for night.' : mine.d ? '. This drop perks it up.' : '.' }}
              disabled={off || !you.canWater}
              onClick={() => {
                playSfx('select');
                void send({ type: 'water' }, left === 1 && !mine.d ? `Your ${word} opened!` : `You watered your ${word}.`);
              }}
            />
          )}
          {neighbours.length ? (
            <div className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-sm font-bold">
                <Gift className="size-4 text-lantern" aria-hidden /> Give a drop to a neighbour
              </h4>
              {you.giftTo.length ? (
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" role="group" aria-label="Give a drop">
                  {you.giftTo.map((g, i) => {
                    const name = names.get(g.id) ?? 'A player';
                    const plot = plots.get(g.id)!;
                    const pk = plot.k ? KIND_WORD[plot.k] : 'plant';
                    return (
                      <Action
                        key={g.id}
                        tone={i === 0 ? 'gift' : 'calm'}
                        highlight={i === 0}
                        icon={<Gift className="size-6" aria-hidden />}
                        label={name}
                        sub={`${WHY_WORD[g.why]} ${pk}${i === 0 ? ': needs it most' : ''}`}
                        sr={{ before: 'Give ', mid: ' a drop: ', after: `${g.glowing ? '' : '. Their plot is not glowing yet'}.` }}
                        disabled={off}
                        onClick={() => {
                          playSfx('shield');
                          void send({ type: 'give', to: g.id }, `You gave ${name} a drop.`);
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-2">Nothing next to you is growing right now.</p>
              )}
            </div>
          ) : null}
          {note ? (
            <p className="text-sm font-bold text-ember" role="alert">
              {note}
            </p>
          ) : null}
        </StagePanel>
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions">
          <StagePanel className="hidden flex-col gap-2 p-2.5 lg:flex" as="div">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Clock view={view} gameNow={gameNow} />
              <span className="text-sm font-bold">
                {formatNumber(you.points)} {you.points === 1 ? 'point' : 'points'}
              </span>
            </div>
            <GoalBar glowing={garden.glowing} goal={garden.goal} fireflies={garden.fireflies} name={view.gardens.length > 1 ? teamName(room, garden.teamId) : null} />
          </StagePanel>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-text-2">
          <Droplet className="size-4 text-[#8fd3ff]" aria-hidden /> A right answer gives a drop.
        </p>
        {you.last && !you.last.correct && you.question ? (
          <ResultBanner key={you.last.iid} correct={false} partial={you.last.partial} text={you.last.text} />
        ) : you.last?.correct ? (
          <ResultBanner key={you.last.iid} correct text={you.last.text} />
        ) : null}
        {you.question ? (
          <>
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
          </>
        ) : null}
      </section>
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

export function GlimGardenHost({ view, gameNow, room }: ModeScreenProps<GardenView>) {
  const scene = useRef<GardenHostScene | null>(null);
  const names = useNames(room);
  const looks = useLooks(room);
  const state = useMemo(() => sceneState(view, room, looks, names), [view, room, looks, names]);
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  const topNews = view.news?.[0];
  useSfx('rankUp', topNews?.id ?? null, Boolean(topNews));
  const fullCount = view.gardens.filter((g) => g.full).length;
  useSfx('win', fullCount || null, fullCount > 0);
  const all = view.gardens.flatMap((g) => g.plots);
  const glowing = view.gardens.reduce((n, g) => n + g.glowing, 0);
  const goal = view.gardens.reduce((n, g) => n + g.goal, 0);
  const fireflies = view.gardens.reduce((n, g) => n + g.fireflies, 0);
  const teamGardens = view.gardens.length > 1;
  const label = hostPicture({
    plots: all.length,
    glowing,
    goal,
    fireflies,
    blooming: all.filter((p) => p.b).length,
    teams: teamGardens ? view.gardens.map((g) => ({ name: teamName(room, g.teamId) ?? 'A team', glowing: g.glowing, goal: g.goal })) : null,
    dark: view.nightBloom ? view.dark : null,
  });
  useAnnounce(fullCount ? (teamGardens ? `${fullCount} of ${view.gardens.length} team gardens are full of fireflies.` : 'The garden is full of fireflies!') : null, fullCount);
  const rows = view.board.slice(0, 5).map((r) => ({ playerId: r.playerId, name: r.name, score: r.points, rank: r.rank, teamId: r.teamId }));
  const full = view.gardens.every((g) => g.full);

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Glim Garden</ModeTitle>
          <p className="font-semibold text-text-2">Right answers are drops of water. Grow the garden together.</p>
        </div>
        <Clock view={view} gameNow={gameNow} big />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
        <div className="relative min-h-[54vh] lg:min-h-[calc(100dvh-15rem)]">
          <Stage3D<GardenHostScene>
            label={label}
            create={(env) => new GardenHostScene(env)}
            onWorld={(w) => {
              scene.current = w;
              w?.setState(state);
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<GardenMap gardens={mapGardens(view, room)} need={view.plotFireflies} names={(id) => names.get(id) ?? 'A player'} dark={view.dark} nightBloom={view.nightBloom} label={label} big className="h-full w-full" />}
          />
          {full ? (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <p className="plate plate-gold text-[clamp(1.4rem,2.6vw,2.8rem)]">
                <span>{teamGardens ? 'Every garden is full!' : 'The garden is full!'}</span>
              </p>
            </div>
          ) : null}
          {view.news?.length ? (
            <ul className="pointer-events-none absolute right-3 bottom-3 flex max-w-[min(30rem,60%)] flex-col items-end gap-1.5" aria-label="Garden news">
              {view.news.slice(0, 2).map((n, i) => (
                <li key={n.id} className={`max-w-full truncate rounded-[var(--radius-m)] px-3 py-1.5 text-[clamp(0.95rem,1.25vw,1.35rem)] font-bold backdrop-blur-sm ${i === 0 ? 'bg-black/70 text-white' : 'bg-black/50 text-white/85'}`}>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <StagePanel className="flex flex-col gap-3 p-3" as="section" label="The goal">
            <h3 className="flex items-center gap-2 font-display text-xl font-extrabold">
              <Sprout className="size-5 text-glim" aria-hidden /> {teamGardens ? 'Team gardens' : 'Light up the garden'}
            </h3>
            {teamGardens ? (
              view.gardens.map((g) => <GoalBar key={g.teamId ?? 'all'} glowing={g.glowing} goal={g.goal} fireflies={g.fireflies} name={teamName(room, g.teamId)} />)
            ) : (
              <GoalBar glowing={glowing} goal={goal} fireflies={fireflies} big />
            )}
            <p className="text-sm text-text-2">A plot glows with {firefliesText(view.plotFireflies)}.</p>
          </StagePanel>
          {view.showTable ? (
            <StagePanel className="flex flex-col gap-2 p-3" as="aside" label="Busy gardeners">
              <h3 className="font-display text-xl font-extrabold">Busy gardeners</h3>
              <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense label={(r) => `${formatNumber(r.score)} ${r.score === 1 ? 'pt' : 'pts'}`} />
            </StagePanel>
          ) : (
            <StagePanel className="p-3" as="aside" label="Gardeners">
              <p className="font-semibold">
                {formatNumber(view.blooms ?? 0)} {view.blooms === 1 ? 'bloom' : 'blooms'} and {formatNumber(view.gifts ?? 0)} {view.gifts === 1 ? 'gift' : 'gifts'} from {formatNumber(view.players)} {view.players === 1 ? 'gardener' : 'gardeners'}.
              </p>
            </StagePanel>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- results --------------------------------- */

/** The results open on the garden the class grew. */
export function GlimGardenEnding({ room, big }: { room: RoomView; big: boolean }) {
  const view = room.game as GardenView | null;
  const names = useNames(room);
  if (!view?.gardens) return null;
  const all = view.gardens.flatMap((g) => g.plots);
  const glowing = view.gardens.reduce((n, g) => n + g.glowing, 0);
  const goal = view.gardens.reduce((n, g) => n + g.goal, 0);
  const fireflies = view.gardens.reduce((n, g) => n + g.fireflies, 0);
  const blooms = all.reduce((n, p) => n + p.r[0] + p.r[1] + p.r[2], 0);
  const full = view.gardens.every((g) => g.full);
  const label = `The garden the class grew: ${all.length} plots, ${blooms} blooms, ${glowing} plots glowing, ${firefliesText(fireflies)}.`;
  return (
    <section className="flex w-full flex-col items-center gap-3" aria-labelledby="garden-ending">
      <h2 id="garden-ending" className={`font-display leading-[0.95] font-extrabold ${big ? 'text-[clamp(2.4rem,4.4vw,5rem)]' : 'text-[2.4rem]'}`}>
        {full ? 'The garden is full' : 'The garden you grew'}
      </h2>
      <GardenMap gardens={mapGardens(view, room)} need={view.plotFireflies} names={(id) => names.get(id) ?? 'A player'} dark nightBloom={false} label={label} big={big} className={`w-full rounded-[var(--radius-l)] ${big ? 'h-[clamp(14rem,38vh,30rem)] max-w-[64rem]' : 'h-56'}`} />
      <ul className={`flex flex-wrap justify-center gap-2 ${big ? 'text-[clamp(1rem,1.5vw,1.6rem)]' : ''}`} aria-label="The garden in numbers">
        <li><Pill tone="lantern"><Sparkles className="size-[1em]" aria-hidden /> {formatNumber(fireflies)} fireflies</Pill></li>
        <li><Pill><Flower2 className="size-[1em]" aria-hidden /> {formatNumber(blooms)} blooms</Pill></li>
        <li><Pill tone={full ? 'glim' : 'calm'}><Sprout className="size-[1em]" aria-hidden /> {glowing} of {goal} plots glowing</Pill></li>
      </ul>
    </section>
  );
}
