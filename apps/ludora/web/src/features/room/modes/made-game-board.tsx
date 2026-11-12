import type { CSSProperties, ReactNode } from 'react';
import { Gem, Heart, HeartCrack, Flag, Shield } from 'lucide-react';
import { amountOf, KIND_INFO, kindSize, type Blueprint, type RoomPlayerView, type TeamView } from '@ludora/shared';
import type { MadeRow, MadeView } from '@ludora/engine';
import { PlayerGlim, avatarOf, NIGHT } from '../game/stage.tsx';
import { ordinal } from '../../../lib/format.ts';

/*
 * The 2D boards of made games, one per kind, drawn from the blueprint and the view. Each is a
 * picture with a text equivalent (list items with full labels), so it reads the same with a screen
 * reader. Colours come from the maker's two hues, always behind ink or white text that passes AA.
 */

/** The maker's colours as fills: bright enough to read on the dark stage. */
export const fill = (hue: number, light = 62) => `hsl(${hue} 80% ${light}%)`;

function stripes(bp: Blueprint, hue: number): CSSProperties {
  if (bp.look.style === 'striped') return { backgroundImage: `repeating-linear-gradient(135deg, ${fill(hue)} 0 10px, ${fill(hue, 54)} 10px 20px)` };
  if (bp.look.style === 'soft') return { background: `linear-gradient(90deg, ${fill(hue, 48)}, ${fill(hue, 66)})` };
  return { background: fill(hue) };
}

/** A small hue for a player's own squares on a territory map: their team's, or one from their id. */
export function playerHue(id: string, teamId: string | null, teams: TeamView[]): number {
  const t = teamId ? teams.find((x) => x.id === teamId) : undefined;
  if (t) return t.hue;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function rowLabel(r: MadeRow, bp: Blueprint): string {
  const bits = [`${r.name}: ${amountOf(r.score, bp.unit)}`];
  if (r.lives !== null) bits.push(r.out ? 'out' : `${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left`);
  if (r.place) bits.push(`finished ${ordinal(r.place)}`);
  return bits.join(', ');
}

const columns = (n: number, big: boolean) => (!big || n <= 8 ? 1 : n <= 20 ? 2 : n <= 32 ? 3 : 4);

/** Lanes for races and climbs: each player's Glim along a bar towards the goal. */
function Lanes({ view, players, big, me }: { view: MadeView; players: RoomPlayerView[]; big: boolean; me: string | null }) {
  const bp = view.game;
  const goal = kindSize(bp.kind);
  const cols = columns(view.rows.length, big);
  return (
    <ul className={`grid gap-1.5 ${big ? 'gap-x-4' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label={bp.kind.type === 'climb' ? 'The climb' : 'The race'}>
      {view.rows.map((r) => {
        const pct = Math.min(100, (r.score / goal) * 100);
        return (
          <li key={r.playerId} className={`grid grid-cols-[minmax(4.5rem,9rem)_1fr] items-center gap-2 rounded-[var(--radius-m)] px-2 py-1 ${r.playerId === me ? 'bg-lantern/[0.16] ring-2 ring-lantern ring-inset' : 'bg-white/[0.05]'}`}>
            <span className="sr-only">{rowLabel(r, bp)}</span>
            <span className={`truncate font-bold ${big ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`} aria-hidden>
              {r.name}
            </span>
            <div className={`relative ${big ? 'h-[clamp(2rem,4vh,3.25rem)]' : 'h-8'}`} aria-hidden>
              <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10" />
              {view.shortcuts.map((s) => (
                <span key={s} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(s / goal) * 100}%`, background: fill(bp.look.accent) }} />
              ))}
              {view.ledgeEvery
                ? Array.from({ length: Math.floor(goal / view.ledgeEvery) }, (_, i) => (i + 1) * view.ledgeEvery!).map((l) => (
                    <span key={l} className="absolute inset-y-1 w-0.5 bg-white/25" style={{ left: `${(l / goal) * 100}%` }} />
                  ))
                : null}
              <span className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${pct}%`, ...stripes(bp, bp.look.hue) }} />
              <Flag className="absolute top-1/2 right-0 size-5 -translate-y-1/2 text-lantern" />
              <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ease-[var(--ease-out)]" style={{ left: `calc(${pct}% * 0.94 + 3%)` }}>
                <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={48} className={big ? 'size-[clamp(2rem,4vh,3.25rem)]' : 'size-8'} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Score rows for collect, lives and build: name, a bar, the number, hearts where there are lives. */
function Rows({ view, players, big, me }: { view: MadeView; players: RoomPlayerView[]; big: boolean; me: string | null }) {
  const bp = view.game;
  const max = Math.max(1, bp.kind.type === 'collect' ? bp.kind.goal : 0, ...view.rows.map((r) => r.score));
  const cols = columns(view.rows.length, big);
  return (
    <ul className={`grid gap-1.5 ${big ? 'gap-x-4' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label="Scores">
      {view.rows.map((r) => (
        <li key={r.playerId} className={`flex items-center gap-2 rounded-[var(--radius-m)] px-2 py-1 ${r.playerId === me ? 'bg-lantern/[0.16] ring-2 ring-lantern ring-inset' : 'bg-white/[0.05]'} ${r.out ? 'opacity-60' : ''}`}>
          <span className="sr-only">{rowLabel(r, bp)}</span>
          <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={40} className={`shrink-0 ${big ? 'size-[clamp(2rem,4vh,3rem)]' : 'size-8'} ${r.out ? 'grayscale' : ''}`} />
          <span className={`w-[clamp(4rem,30%,10rem)] shrink-0 truncate font-bold ${big ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`} aria-hidden>
            {r.name}
          </span>
          <span className="relative h-2 min-w-6 flex-1 rounded-full bg-white/10" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (r.score / max) * 100)}%`, ...stripes(bp, bp.look.hue) }} />
          </span>
          {r.lives !== null && bp.kind.type === 'survive' ? (
            <span className="flex shrink-0 gap-0.5" aria-hidden>
              {Array.from({ length: bp.kind.lives }, (_, i) =>
                i < r.lives! ? <Heart key={i} className="size-4 fill-ember text-ember" /> : <HeartCrack key={i} className="size-4 text-text-2" />,
              )}
            </span>
          ) : null}
          <span className={`shrink-0 font-display font-extrabold tabular ${big ? 'text-[clamp(1.25rem,2vw,2.25rem)]' : 'text-lg'}`} aria-hidden>
            {r.score}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The shared tower: how high the class has built it, towards the goal. */
function Tower({ view, big }: { view: MadeView; big: boolean }) {
  const bp = view.game;
  const target = bp.kind.type === 'build' ? bp.kind.target : 1;
  const pct = Math.min(100, (view.tower / target) * 100);
  const bricks = 12;
  return (
    <div className="flex items-end gap-4" role="img" aria-label={`The tower: ${amountOf(view.tower, bp.unit)} of ${target}.`}>
      <div className={`relative flex w-[clamp(5rem,14vw,10rem)] flex-col-reverse gap-1 rounded-[var(--radius-m)] p-1.5 ${NIGHT} ${big ? 'h-[clamp(12rem,40vh,26rem)]' : 'h-40'}`} aria-hidden>
        {Array.from({ length: bricks }, (_, i) => {
          const on = pct >= ((i + 1) / bricks) * 100 - 0.01;
          return <span key={i} className="flex-1 rounded-[var(--radius-s)] transition-opacity duration-300" style={on ? stripes(bp, i % 2 ? bp.look.hue : bp.look.accent) : { background: 'rgb(255 255 255 / 0.06)' }} />;
        })}
      </div>
      <p className="flex flex-col leading-none" aria-hidden>
        <span className={`font-display font-extrabold tabular ${big ? 'text-[clamp(3rem,6vw,6.5rem)]' : 'text-[2.5rem]'}`}>{view.tower}</span>
        <span className={`font-bold text-text-2 ${big ? 'text-[clamp(1.1rem,1.6vw,1.75rem)]' : ''}`}>
          of {target} {bp.unit}
        </span>
      </p>
    </div>
  );
}

/** The territory map: each square in its holder's colour, with the holder's initial so colour is never the only clue. */
function Territory({ view, players, teams, big, me }: { view: MadeView; players: RoomPlayerView[]; teams: TeamView[]; big: boolean; me: string | null }) {
  const bp = view.game;
  const side = bp.kind.type === 'territory' ? bp.kind.grid : 4;
  const tiles = view.tiles ?? [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? view.rows.find((r) => r.playerId === id)?.name ?? '?';
  const teamOf = (id: string) => players.find((p) => p.id === id)?.teamId ?? null;
  const mine = me ? tiles.filter((t) => t === me).length : 0;
  return (
    <div className={`grid gap-4 ${big ? 'lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)]' : ''}`}>
      <div
        className={`mx-auto grid aspect-square gap-1 rounded-[var(--radius-l)] p-1.5 ${NIGHT} ${big ? 'w-[min(60vh,42rem)]' : 'w-full max-w-[22rem]'}`}
        style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`The map, ${side} by ${side}.${me ? ` You hold ${mine}.` : ''} ${tiles.filter((t) => t === null).length} squares are free.`}
      >
        {tiles.map((t, i) => (
          <span
            key={i}
            className={`flex items-center justify-center rounded-[var(--radius-s)] font-display font-extrabold text-ink ${big ? 'text-[clamp(0.9rem,1.6vw,1.6rem)]' : 'text-xs'} ${t === me && me ? 'ring-2 ring-white ring-inset' : ''}`}
            style={t ? { background: fill(playerHue(t, teamOf(t), teams)) } : { background: 'rgb(255 255 255 / 0.06)' }}
            aria-hidden
          >
            {t ? nameOf(t).charAt(0).toUpperCase() : ''}
          </span>
        ))}
      </div>
      <Rows view={view} players={players} big={big} me={me} />
    </div>
  );
}

/** The tug: a rope with a marker between two teams' ends. */
function Tug({ view, teams, big }: { view: MadeView; teams: TeamView[]; big: boolean }) {
  const bp = view.game;
  const rope = bp.kind.type === 'tug' ? bp.kind.rope : 10;
  const pulls = view.pulls ?? [];
  const named = pulls.map((p) => ({ ...p, team: teams.find((t) => t.id === p.teamId) }));
  const a = named[0];
  const b = named[1];
  const margin = (a?.pulls ?? 0) - (b?.pulls ?? 0);
  const pos = 50 - Math.max(-1, Math.min(1, margin / rope)) * 50;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 font-display font-extrabold" aria-hidden>
        {named.slice(0, 2).map((t) => (
          <span key={t.teamId} className={`rounded-full px-3 py-1 text-ink ${big ? 'text-[clamp(1.25rem,2.2vw,2.5rem)]' : 'text-lg'}`} style={{ background: fill(t.team?.hue ?? bp.look.hue) }}>
            {t.team?.name ?? 'Team'} {t.pulls}
          </span>
        ))}
      </div>
      <div className={`relative rounded-full ${big ? 'h-[clamp(2.5rem,6vh,4rem)]' : 'h-10'} ${NIGHT}`} role="img" aria-label={named.length >= 2 ? `${a?.team?.name ?? 'Team one'} ${a?.pulls ?? 0}, ${b?.team?.name ?? 'Team two'} ${b?.pulls ?? 0}. A team needs to be ${rope} ahead to win.` : `Pulls: ${a?.pulls ?? 0} of ${rope}.`}>
        <span className="absolute inset-y-[42%] right-4 left-4 rounded-full" style={stripes(bp, bp.look.accent)} />
        <span className="absolute inset-y-0 left-1/2 w-0.5 bg-white/40" />
        <span className="absolute top-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lantern shadow-lg transition-[left] duration-500 ease-[var(--ease-out)]" style={{ left: `${pos}%`, aspectRatio: '1' }} />
      </div>
      {named.length > 2 ? (
        <ul className="flex flex-wrap gap-2 text-sm font-bold">
          {named.slice(2).map((t) => (
            <li key={t.teamId}>
              {t.team?.name ?? 'Team'}: {t.pulls}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The board for any made game. `me` is the viewing player (null on the big screen). */
export function MadeBoard({ view, players, teams, big = false, me = null }: { view: MadeView; players: RoomPlayerView[]; teams: TeamView[]; big?: boolean; me?: string | null }) {
  const k = view.game.kind.type;
  let body: ReactNode;
  if (k === 'race' || k === 'climb') body = <Lanes view={view} players={players} big={big} me={me} />;
  else if (k === 'build') body = (
    <div className={`grid gap-4 ${big ? 'lg:grid-cols-[auto_minmax(0,1fr)]' : ''}`}>
      <Tower view={view} big={big} />
      <Rows view={view} players={players} big={big} me={me} />
    </div>
  );
  else if (k === 'territory') body = <Territory view={view} players={players} teams={teams} big={big} me={me} />;
  else if (k === 'tug') body = (
    <div className="flex flex-col gap-4">
      <Tug view={view} teams={teams} big={big} />
      <Rows view={view} players={players} big={big} me={me} />
    </div>
  );
  else body = <Rows view={view} players={players} big={big} me={me} />;
  return (
    <section aria-label={`${KIND_INFO[k].label} board`} className={`rounded-[var(--radius-l)] border border-white/10 ${NIGHT} ${big ? 'p-[clamp(0.75rem,1.4vw,1.5rem)]' : 'p-2'}`}>
      {body}
    </section>
  );
}

/** A collect player's own grid: open a square for each one earned. */
export function GemGrid({ grid, picks, onPick, disabled, unit }: { grid: (number | null)[]; picks: number; onPick: (cell: number) => void; disabled?: boolean; unit: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-bold" role="status">
        {picks > 0 ? `You can open ${picks === 1 ? '1 square' : `${picks} squares`}.` : 'Answer right to open a square.'}
      </p>
      <div className="grid w-full max-w-[20rem] grid-cols-4 gap-1.5" role="group" aria-label="Your grid">
        {grid.map((v, i) => {
          const open = v !== null;
          const label = open ? (v < 0 ? `Square ${i + 1}: a trap` : `Square ${i + 1}: ${amountOf(v, unit)}`) : `Open square ${i + 1}`;
          return (
            <button
              key={i}
              type="button"
              aria-label={label}
              disabled={open || picks <= 0 || disabled}
              onClick={() => onPick(i)}
              className={`press-soft flex aspect-square min-h-11 items-center justify-center rounded-[var(--radius-m)] font-display text-xl font-extrabold ${open ? 'bg-white/[0.06] text-text' : picks > 0 ? 'bg-lantern text-on-accent' : 'bg-white/[0.12] text-text-2'}`}
            >
              {open ? v! < 0 ? <Shield className="size-5 text-ember" aria-hidden /> : v === 0 ? '0' : (
                <span className="flex items-center gap-0.5">
                  {v}
                  <Gem className="size-4" aria-hidden />
                </span>
              ) : (
                '?'
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
