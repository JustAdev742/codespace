import { CIRCUITS, PRIZE_INFO, lapPos, type CircuitId, type Prize } from '@ludora/engine/lantern-rally';
import { formatNumber } from '../../../lib/format.ts';

/*
 * Lantern Rally in words: the picture's description for screen readers (your
 * place, lap, lane, who is near and what lies ahead in each lane) and the line
 * for each thing that happens to your kart. Pure functions, so they are tested
 * without a browser and the 3D scene and the drawn map say exactly the same.
 */

export type RaceKind = 'race' | 'relay' | 'gp' | 'trial';

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

export function timeText(ms: number): string {
  const tenths = Math.round(ms / 100);
  const s = tenths / 10;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

const metres = (n: number) => `${Math.max(0, Math.round(n))} ${Math.round(n) === 1 ? 'metre' : 'metres'}`;
export const laneName = (lane: number) => (lane <= 0 ? 'left lane' : lane >= 2 ? 'right lane' : 'middle lane');
const ITEM = ['a puddle', 'cones', 'a lantern'] as const;

export interface WordsKart {
  name: string;
  d: number;
  lane: number;
  me: boolean;
  finished: number | null;
}

export interface WordsInput {
  kind: RaceKind;
  circuit: CircuitId;
  length: number;
  laps: number | null;
  race: number;
  races: number;
  /** Game time now and when the lights go out. */
  now: number;
  startAt: number;
  phase: 'race' | 'break';
  racers: number;
  you: {
    d: number;
    lane: number;
    place: number;
    lap: number;
    finished: number | null;
    finishMs: number | null;
    bestLap: number | null;
    lapStart: number;
    shield: boolean;
    boosting: boolean;
    ghost: number[] | null;
    got: number[];
  };
  karts: WordsKart[];
  /** [metres round the lap, lane, 0 puddle / 1 cones / 2 lantern] */
  items: [number, number, number][];
  teamMetres?: number | null;
}

/** What lies ahead of you within `range` metres: the nearest thing in each lane. */
export function aheadWords(d: number, lane: number, length: number, items: WordsInput['items'], got: number[], range = 45): string {
  const pos = lapPos(d, length);
  const parts: string[] = [];
  for (const l of [lane, ...[0, 1, 2].filter((x) => x !== lane)]) {
    const next = items
      .map((it, i) => ({ it, i, gap: lapPos(it[0] - pos, length) }))
      .filter((x) => x.it[1] === l && x.gap > 0.5 && x.gap <= range && !(x.it[2] === 2 && got.includes(x.i)))
      .sort((a, b) => a.gap - b.gap)[0];
    if (!next) continue;
    const where = l === lane ? 'in your lane' : `in the ${laneName(l)}`;
    parts.push(`${ITEM[next.it[2] as 0 | 1 | 2]} ${where} in ${metres(next.gap)}`);
  }
  if (!parts.length) return 'The road ahead is clear.';
  const [first, ...rest] = parts;
  return `Ahead: ${first}${rest.length ? `; ${rest.join('; ')}` : ''}.`;
}

/** Seconds ahead of (negative: behind) your best lap's ghost, or null with no ghost yet. */
export function ghostGap(ghost: number[] | null, lapStart: number, now: number, d: number, length: number): number | null {
  if (!ghost || ghost.length < 3 || d < 0) return null;
  const pos = lapPos(d, length);
  // When did the ghost pass where you are now?
  let prev = 0;
  for (let i = 1; i < ghost.length; i++) {
    const a = ghost[i - 1]! / 10;
    const b = ghost[i]! / 10;
    if (b < prev - 1) break;
    prev = b;
    if (pos >= a && pos <= b) {
      const k = b > a ? (pos - a) / (b - a) : 0;
      const ghostMs = (i - 1 + k) * 500;
      return Math.round(ghostMs - (now - lapStart)) / 1000;
    }
  }
  return null;
}

/** The picture in words: where you are in the race and what is around you. */
export function raceWords(w: WordsInput): string {
  const y = w.you;
  const circuit = CIRCUITS[w.circuit].name;
  if (w.phase === 'break') return `The break before race ${w.race + 1} of ${w.races}. You finished race ${w.race} ${y.finished ? ordinal(y.finished) : `in ${ordinal(y.place)} place`}.`;
  if (w.now < w.startAt) {
    const secs = Math.max(1, Math.ceil((w.startAt - w.now) / 1000));
    const race = w.kind === 'gp' ? `Race ${w.race} of ${w.races}, ` : '';
    const laps = w.laps ? `${w.laps} ${w.laps === 1 ? 'lap' : 'laps'}` : w.kind === 'trial' ? 'a time trial' : 'against the clock';
    const grid = w.kind === 'trial' ? '' : ` You start ${ordinal(y.place)} of ${w.racers}, in the ${laneName(y.lane)}.`;
    const line = `${race}on the grid at ${circuit}, ${laps}. The lights go out in ${secs} ${secs === 1 ? 'second' : 'seconds'}.${grid}`;
    return line.charAt(0).toUpperCase() + line.slice(1);
  }
  if (y.finished !== null) return `You finished ${ordinal(y.finished)}${y.finishMs !== null ? ` in ${timeText(y.finishMs)}` : ''}.${w.racers > 1 ? ` ${w.karts.filter((k) => k.finished === null && !k.me).length ? 'Others are still racing.' : ''}` : ''}`.trim();
  let where: string;
  if (w.kind === 'trial') {
    const gap = ghostGap(y.ghost, y.lapStart, w.now, y.d, w.length);
    where = `Lap ${y.lap}, in the ${laneName(y.lane)}.${y.bestLap !== null ? ` Best lap ${timeText(y.bestLap)}.` : ''}${gap !== null ? ` ${Math.abs(gap) < 0.05 ? 'Level with your best lap.' : `${Math.abs(gap).toFixed(1)} seconds ${gap > 0 ? 'ahead of' : 'behind'} your best lap.`}` : ''}`;
  } else {
    const lap = w.laps ? `lap ${y.lap} of ${w.laps}` : `lap ${y.lap}`;
    where = w.kind === 'relay' ? `Lap ${y.lap}, in the ${laneName(y.lane)}.${w.teamMetres ? ` Your team has driven ${formatNumber(w.teamMetres)} metres.` : ''}` : `You are ${ordinal(y.place)} of ${w.racers}, ${lap}, in the ${laneName(y.lane)}.`;
    const others = w.karts.filter((k) => !k.me && k.finished === null);
    const front = others.filter((k) => k.d > y.d).sort((a, b) => a.d - b.d)[0];
    const back = others.filter((k) => k.d <= y.d).sort((a, b) => b.d - a.d)[0];
    if (front && front.d - y.d < 60) where += ` ${front.name} is ${metres(front.d - y.d)} ahead${front.lane === y.lane ? ' in your lane' : ''}.`;
    if (back && y.d - back.d < 40) where += ` ${back.name} is ${metres(y.d - back.d)} behind.`;
  }
  const extras = `${y.boosting ? ' Boosting.' : ''}${y.shield ? ' Shield up.' : ''}`;
  return `${where}${extras} ${aheadWords(y.d, y.lane, w.length, w.items, y.got)}`;
}

export type EventKind = 'boost' | 'full' | 'puddle' | 'cone' | 'shield' | 'lantern' | 'cough' | 'lap' | 'finish' | 'up' | 'down' | 'start';

export interface RallyEventView {
  seq: number;
  at: number;
  kind: EventKind;
  prize?: Prize;
  place?: number;
  lap?: number;
  ms?: number;
  best?: boolean;
  final?: boolean;
}

/** One line for something that happened to your kart. */
export function eventLine(e: RallyEventView, o: { laps: number | null; kind: RaceKind; circuit: CircuitId }): string {
  switch (e.kind) {
    case 'boost':
      return 'Boost!';
    case 'full':
      return 'Your charges were full, so it boosted at once.';
    case 'puddle':
      return 'Splash! A puddle slowed you down.';
    case 'cone':
      return 'You clipped the cones and slowed down.';
    case 'shield':
      return 'Your shield took the hit.';
    case 'lantern':
      return `Lantern! ${PRIZE_INFO[e.prize ?? 'glow'].label}: ${PRIZE_INFO[e.prize ?? 'glow'].text}.`;
    case 'cough':
      return 'Your engine coughed.';
    case 'lap': {
      const t = e.ms !== undefined ? ` Lap time ${timeText(e.ms)}${e.best && (e.lap ?? 0) > 1 ? ', your best yet' : ''}.` : '';
      if (o.laps !== null && (e.lap ?? 0) >= o.laps) return `Over the line!${t}`;
      if (e.final) return `Final lap!${t}`;
      return `Lap ${(e.lap ?? 0) + 1}${o.laps ? ` of ${o.laps}` : ''}.${t}`;
    }
    case 'finish':
      return `You finished ${ordinal(e.place ?? 0)}${e.ms !== undefined ? ` in ${timeText(e.ms)}` : ''}!`;
    case 'up':
      return `Up to ${ordinal(e.place ?? 0)}!`;
    case 'down':
      return `Down to ${ordinal(e.place ?? 0)}.`;
    case 'start':
      return o.kind === 'gp' ? `Race ${e.lap ?? 1}: ${CIRCUITS[o.circuit].name}.` : `${CIRCUITS[o.circuit].name}.`;
  }
}
