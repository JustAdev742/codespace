/*
 * Lantern Rally: metadata, settings, variants and every number the mode plays
 * by. Plain data only: the browser imports this (with track.ts and odds.ts)
 * for the catalogue, the circuits and the odds, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';
import { CIRCUITS } from './track.ts';

export const meta: ModeMeta = {
  id: 'lantern-rally',
  title: 'Lantern Rally',
  tagline: 'Right answers are the fuel. Boost round a lantern-lit circuit and race the class to the line.',
  description:
    'A night rally round a circuit strung with lanterns. The karts drive themselves; every right answer gives you a boost charge to spend on a burst of speed. Pick your lane to collect lanterns and to dodge puddles and cones, tuck in behind another kart for a slipstream, and cross the line first. Three circuits: a harbour, a forest and the rooftops of a city.',
  category: 'arcade',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 3, max: 6 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 300 },
    help: { timeLimitSec: 'The race ends when everyone has finished, 30 seconds after the winner crosses the line, or when time runs out. With no limit set, it ends after 5 minutes.' },
  },
  rules: [
    'Your kart drives itself. Every right answer gives you a boost charge; you can hold 3. Spend one for 3 seconds of extra speed.',
    'Answer right while you already hold 3 charges and the boost fires at once, so no right answer is wasted.',
    'A wrong answer makes your engine cough: you slow down for a moment and the next question waits until it clears.',
    'Steer left or right between three lanes. Drive through lanterns for a little speed, a shield or a spare charge (the odds are on screen). Steer round puddles and cones: they slow you down, unless you have a shield.',
    'Drive close behind another kart in the same lane for a slipstream: a little extra speed.',
    'Auto-steer (in your controls) steers and boosts for you about as well as an average driver, so you can just answer questions. Nobody else can see who uses it.',
    'Finishing order decides the table: everyone who finishes ranks above everyone still racing, an earlier finisher above a later one, and at the whistle the rest are placed by how far round they are.',
    'Points: 200 for every driver you beat, 100 more for finishing, and 10 for each right answer (your first 15 in a race). Answers can never lift you past someone who placed ahead of you.',
  ],
  thumbnail: { glyph: 'lantern', hue: 248, accentHue: 44 },
  status: 'playable',
  stage: '3d',
  tags: ['race', 'projector', 'self-paced', '3d', 'sport'],
  accessibility: [
    'Boost, steer left and steer right are big labelled buttons. On a laptop the left and right arrow keys steer and B boosts.',
    'Auto-steer steers and boosts for you, so the race plays fully by keyboard, switch or screen reader, or with questions alone.',
    'Your place, lap and what just happened are said in words, and the 3D view is a picture of the same race: it plays identically with 3D off.',
    'The chances of each lantern prize are written as numbers, never shown by colour alone.',
    'Under reduced motion the camera holds steady and boosts do not shake the picture.',
  ],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'circuit',
    label: 'Circuit',
    help: 'Where the race is held. A Grand Prix starts here and visits all three.',
    options: Object.values(CIRCUITS).map((c) => ({ value: c.id, label: c.name })),
    default: 'harbour',
  },
  { kind: 'number', key: 'laps', label: 'Laps', help: 'Laps of the circuit to the finish. A lap is about half a kilometre.', min: 1, max: 6, step: 1, default: 3, unit: 'laps' },
  { kind: 'toggle', key: 'hazards', label: 'Puddles and cones', help: 'Off: a clear track with lanterns only, for younger drivers.', default: true },
  { kind: 'toggle', key: 'relay', label: 'Team relay', help: 'Teams race the clock and every metre a team member drives adds to the team’s distance. There is no finish line.', default: false },
  { kind: 'toggle', key: 'grandPrix', label: 'Grand prix', help: 'Three short races on the three circuits, with points carried over. The leaders start at the back of the next grid.', default: false },
  { kind: 'toggle', key: 'trial', label: 'Time trial', help: 'Everyone drives alone against their own best lap, shown as a ghost. Your best lap is your score.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'lantern-rally-team-relay',
      modeId: 'lantern-rally',
      title: 'Team Relay',
      tagline: 'Every metre counts for your team. Drive as far as you can before the clock runs out.',
      changes:
        'Players are split into teams (2 by default) and race the clock with no finish line: every metre a team member drives adds to the team’s distance, and the team that covers the most ground wins. A smaller team’s distance is scaled up to the size of the largest, so uneven teams are fair.',
      status: 'playable',
      thumbnail: { glyph: 'baton', hue: 248, accentHue: 150 },
    },
    settings: { relay: true },
    common: { teamCount: 2, timeLimitSec: 240 },
    locked: ['relay'],
  },
  {
    meta: {
      id: 'lantern-rally-grand-prix',
      modeId: 'lantern-rally',
      title: 'Grand Prix',
      tagline: 'Three short races on three circuits. Points carry over, and the leaders start at the back.',
      changes:
        'Three one-lap races, one on each circuit, with a short break between them. Race points add up across all three, and each new grid starts in reverse order of the points so far, so the leaders have to overtake their way back to the front.',
      status: 'playable',
      thumbnail: { glyph: 'trophy', hue: 248, accentHue: 44 },
    },
    settings: { grandPrix: true, laps: 1 },
    locked: ['grandPrix', 'laps'],
  },
  {
    meta: {
      id: 'lantern-rally-time-trial',
      modeId: 'lantern-rally',
      title: 'Time Trial',
      tagline: 'Just you, the circuit and the ghost of your best lap.',
      changes:
        'Everyone drives alone: no other karts on your track, so no slipstreams. Lap after lap until the time runs out, chasing a ghost of your own best lap. Your best lap time is your score, which makes it a good way to play alone.',
      status: 'playable',
      thumbnail: { glyph: 'stopwatch', hue: 200, accentHue: 44 },
    },
    settings: { trial: true },
    common: { timeLimitSec: 180 },
    locked: ['trial'],
  },
];

/* ---------------------------------- driving --------------------------------- */

/** Boost charges a driver can hold. */
export const MAX_CHARGES = 3;

/** Speeds in metres a second. Effects add to or take from the cruising speed while they last. */
export const SPEED = { cruise: 10, min: 3 } as const;
export const BOOST = { add: 8, ms: 3000, /** A boost on top of a boost extends it, up to this far ahead. */ capMs: 6000 } as const;
export const GLOW = { add: 4, ms: 2000 } as const;
export const SLIP = { add: 2.5, /** A kart this far ahead in your lane (metres) gives you a slipstream. */ min: 2, max: 14 } as const;
export const HAZARD = {
  puddle: { cut: 5, ms: 1200 },
  cone: { cut: 6, ms: 1600 },
} as const;
export const COUGH = { cut: 5, ms: 1500 } as const;
/** After a wrong answer the next question waits while the engine coughs. */
export const STEADY_MS = COUGH.ms;
/** The quickest a kart can change lane again. */
export const LANE_MS = 220;

/** Countdown on the grid before the lights go out. */
export const GRID_MS = 4000;
/** After the first kart finishes, the rest have this long before the whistle. */
export const WHISTLE_MS = 30_000;
/** Break between Grand Prix races. */
export const BREAK_MS = 12_000;
export const GP_RACES = 3;

/** The simulation's step, and how often every screen gets a full update while racing. */
export const STEP_MS = 50;
export const TICK_MS = 500;

/** The grid: rows of three, this far apart, never longer than `maxSpan` metres. */
export const GRID = { gap: 6, maxSpan: 60 } as const;
/** Finished karts roll to a stop this far past the line. */
export const PARK_M = 22;

/* ---------------------------------- lanterns --------------------------------- */

export type Prize = 'glow' | 'shield' | 'charge';
/** What a lantern gives, drawn on the server from these weights. The screens print them as percentages. */
export const PRIZES: readonly { prize: Prize; weight: number }[] = [
  { prize: 'glow', weight: 60 },
  { prize: 'shield', weight: 25 },
  { prize: 'charge', weight: 15 },
];
export const PRIZE_INFO: Record<Prize, { label: string; text: string }> = {
  glow: { label: 'Glow', text: 'a little extra speed for 2 seconds' },
  shield: { label: 'Shield', text: 'drive through the next puddle or cone untouched' },
  charge: { label: 'Spare charge', text: 'a free boost charge' },
};

/* ---------------------------------- the track --------------------------------- */

export type ItemKind = 'puddle' | 'cone' | 'lantern';
/** Items are spread round each lap in rows: none in the first metres after the line, none blocking all three lanes. */
export const LAYOUT = { firstM: 45, endGapM: 25, gapMin: 22, gapMax: 34 } as const;

/* ---------------------------------- auto-steer -------------------------------- */

export const AUTO = {
  /** How far ahead it looks, in seconds of driving. */
  lookSec: 1.8,
  /** Chance it notices a hazard in its lane in time (an average driver misses some). */
  notice: 0.8,
  /** Chance it goes for a lantern in the next lane when its own lane is clear. */
  lantern: 0.55,
  /** It spends a charge when the road ahead is clear for this many metres, and no sooner than this after the last. */
  clearM: 40,
  boostGapMs: 1200,
} as const;

/* ---------------------------------- points --------------------------------- */

export const POINTS = {
  /** For each right answer, counting the first `answerCap` in a race. */
  answer: 10,
  answerCap: 15,
  /**
   * Places: `placeStep` for every driver you beat (and once for yourself), and `finish` more for
   * crossing the line. A step is bigger than the most anyone can score from answers (15 × 10 =
   * 150), so the finishing order (then the order at the whistle) always decides the table.
   */
  placeStep: 200,
  finish: 100,
  /** Team Relay: metres driven for each point. */
  perPointM: 10,
} as const;

/** The most a driver can score from answers in one race. */
export const MAX_ANSWER_POINTS = POINTS.answer * POINTS.answerCap;

/** Points for a place (1-based) in a race of `racers`, finished or placed at the whistle. */
export function placePoints(place: number, racers: number, finished: boolean): number {
  return POINTS.placeStep * Math.max(1, racers - place + 1) + (finished ? POINTS.finish : 0);
}

/** Time trial score from a best lap: faster is more, and any lap beats none. */
export function trialScore(bestLapMs: number | null, metres: number): number {
  if (bestLapMs === null) return Math.floor(Math.max(0, metres) / POINTS.perPointM);
  return 1000 + Math.max(0, Math.round((180_000 - bestLapMs) / 100));
}
