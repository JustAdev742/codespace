/*
 * Glow Tag Royale: metadata, settings, variants, every constant and table the
 * mode uses, and the shapes of its views, pulse and actions. Plain data and
 * types only: the browser imports this (`@ludora/engine/glow-tag`) for the
 * catalogue, the screens and the odds, so no game logic lives here.
 *
 * Coordinates are metres on the ground plane: x to the right, z forward, with
 * the arena centred on (0, 0). A heading h (radians) faces the direction
 * (sin h, cos h): 0 faces +z, π/2 faces +x. That is what `rotation.y = h`
 * does to a model that faces +z in three.js.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { Answer } from '@ludora/shared';
import type { FeedbackView, ModeVariant, QuestionView } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'glow-tag',
  title: 'Glow Tag Royale',
  tagline: 'Right answers charge your beam. Tag rivals, dodge the shrinking ring and keep your glow.',
  description:
    'A light-tag battle royale in a glowing park at night. Every right answer charges your beam. Walk the arena, tag other players to dim their glow, grab crates, and stay inside the safe ring as it shrinks. Dimmed players answer questions to relight, until the final ring.',
  category: 'arcade',
  pacing: 'self',
  players: { min: 1, max: 40, recommended: '4 to 30' },
  duration: { min: 4, max: 10 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 360 },
    help: { timeLimitSec: 'The game ends when time runs out. With no limit set, it ends after 6 minutes. The ring shrinks at a quarter, a half and three quarters of the time.' },
  },
  rules: [
    'Walk with the keyboard or the on-screen stick. The questions stay open in a panel while you play.',
    'Each right answer in the arena gives 2 beam charges, and 1 more for every third right answer in a row. You can hold 8.',
    'Tag spends a charge. It hits a player within 16 metres, inside a 40-degree cone in front of you, with nothing in between.',
    'Everyone has 3 glow. A tag takes 1, and a player who was just tagged cannot be tagged again for 1.5 seconds.',
    'At 0 glow you are dimmed and leave the arena. Answer 2 questions right to relight at the edge of the ring, with at least 2 charges.',
    'The safe ring shrinks three times. Outside it you lose 1 glow every 3 seconds.',
    'In the final ring nobody relights. Dimmed players keep answering for cheer points.',
    'Walk into a crate for 3 charges, a shield that blocks one tag, or a speed boost.',
    'Scores: 100 a tag, 50 more for dimming someone, 10 a right answer, 100 for glowing when the final ring starts and 200 for glowing at the end.',
    'The game ends when time runs out, or when only one player or team is still glowing in the final ring.',
    'In a team game you cannot tag teammates, and the highest team total wins.',
  ],
  thumbnail: { glyph: 'spark', hue: 160, accentHue: 290 },
  status: 'playable',
  stage: '3d',
  tags: ['3d', 'arcade', 'battle royale', 'tag', 'self-paced', 'projector'],
  accessibility: [
    'Every action is an ordinary button: the Tag button aims at the nearest player in front of you, so a keyboard or a switch is enough.',
    'Glow, charges, the ring and crates are shown as numbers and words, never by colour alone.',
    'The game plays without 3D: the arena is drawn as a map and the controls stay the same.',
  ],
};

/* --------------------------------- the arena -------------------------------- */

/** A player is a circle this wide (radius, metres) for walls, cover and crates. */
export const PLAYER_RADIUS = 0.5;

/**
 * The arena is a square, `minSize` metres a side for up to `smallRoom` players,
 * growing evenly to `maxSize` at `bigRoom` players. Cover stays out of a band
 * `edgeBand` metres wide around the edge (the running track where everyone
 * starts) and out of two cross lanes `lane` metres either side of the centre
 * lines. Cover pieces keep `gap` metres apart, so a player can always walk
 * between them. Each quarter of the park holds one piece for every
 * `areaPerPiece` square metres of its open ground, between `minPieces` and
 * `maxPieces`, and the other three quarters are the same quarter turned.
 */
export const ARENA = { minSize: 40, maxSize: 80, smallRoom: 6, bigRoom: 40, edgeBand: 5, lane: 3, gap: 2.2, areaPerPiece: 30, minPieces: 4, maxPieces: 18 } as const;

export const COVER_KINDS = ['hedge', 'boxes', 'climber', 'slide'] as const;
/** Box-shaped cover: hedges, stacks of wooden boxes and play equipment. */
export type CoverKind = (typeof COVER_KINDS)[number];

/** The sizes (width along x, depth along z, before any turn) and how often each cover kind is chosen. Trees are round. */
export const COVER_SHAPES: Record<CoverKind | 'tree', { weight: number; sizes: readonly (readonly [number, number])[] }> = {
  hedge: { weight: 34, sizes: [[4, 1], [5, 1], [6, 1]] },
  boxes: { weight: 22, sizes: [[1.6, 1.6], [2.4, 1.6]] },
  climber: { weight: 10, sizes: [[3, 2.6]] },
  slide: { weight: 10, sizes: [[4, 1.4]] },
  tree: { weight: 24, sizes: [[1.2, 1.2], [1.6, 1.6], [2, 2]] },
};

/** Box cover: [kind (an index into COVER_KINDS), centre x, centre z, width along x, depth along z], metres. */
export type CoverBox = [kind: number, x: number, z: number, w: number, d: number];
/** A tree: [centre x, centre z, radius], metres. */
export type CoverTree = [x: number, z: number, r: number];

export interface ArenaMap {
  /** Side of the square in metres. x and z run from -size/2 to size/2. */
  size: number;
  boxes: CoverBox[];
  trees: CoverTree[];
}

/* -------------------------------- the players ------------------------------- */

/**
 * Walking. Moves come at up to `rate` a second. A move may cover `speed` m/s
 * (times `boost` with a speed boost) of game time, and a player can bank at
 * most `windowMs` of standing still plus `slackMs` for network jitter: a step
 * longer than that is cut short, not refused.
 */
export const MOVE = { speed: 5, boost: 1.4, slackMs: 150, windowMs: 400, rate: 8 } as const;

/** Beam charges: `perRight` for each right answer, `streakBonus` more on every `streakEvery`th in a row, at most `max`. */
export const CHARGE = { perRight: 2, streakEvery: 3, streakBonus: 1, max: 8 } as const;

/** Glow at the start and after relighting; One Glow gives 1. */
export const GLOW = { start: 3, oneGlow: 1 } as const;

/** A tag reaches `range` metres inside a `coneDeg` cone, every `cooldownMs`. A tagged player is safe for `safeMs`. */
export const TAG = { range: 16, coneDeg: 40, cooldownMs: 700, safeMs: 1500 } as const;

/**
 * Right answers a dimmed player needs to relight (One Glow: `oneGlowNeed`).
 * They do not charge the beam, but a player relights with at least `charges`
 * charges, and is safe for `safeMs`.
 */
export const RELIGHT = { need: 2, oneGlowNeed: 1, charges: 2, safeMs: 3000 } as const;

/**
 * The safe ring. It starts big enough to cover the whole arena (`startRadius`
 * of half the side). Each phase starts at `at` of the time limit and shrinks
 * the ring to `radius` of half the side over `shrinkMs` (less in a very short
 * game). The next ring is shown as soon as the last shrink ends. Its centre
 * drifts from the last one by up to `drift` of the room the shrink leaves.
 * Outside the ring a player loses `drain` glow every `drainEveryMs`. The last
 * phase is the final ring: nobody relights from then on.
 */
export const RING = {
  startRadius: 1.5,
  phases: [
    { at: 0.25, radius: 0.7 },
    { at: 0.5, radius: 0.45 },
    { at: 0.75, radius: 0.2 },
  ],
  shrinkMs: 15_000,
  drift: 0.5,
  drainEveryMs: 3000,
  drain: 1,
} as const;

/* --------------------------------- the crates ------------------------------- */

export const CRATE_KINDS = ['charge', 'shield', 'speed'] as const;
export type CrateKind = (typeof CRATE_KINDS)[number];

/** What a crate holds, drawn when it appears. The screen shows these as percentages. */
export const CRATE_ODDS: readonly { kind: CrateKind; weight: number }[] = [
  { kind: 'charge', weight: 50 },
  { kind: 'shield', weight: 25 },
  { kind: 'speed', weight: 25 },
];

export const CRATE_INFO: Record<CrateKind, { label: string; blurb: string }> = {
  charge: { label: 'Charge pack', blurb: '+3 beam charges.' },
  shield: { label: 'Shield', blurb: 'Blocks the next tag on you.' },
  speed: { label: 'Speed boost', blurb: 'Walk 40% faster for 8 seconds.' },
};

/**
 * Crates appear inside the ring (inside the next ring once it is shown), the
 * first after `firstMs`, then one every `everyMs` (from `everySmall` in a
 * small room down to `everyBig` with 40 players), while fewer than the most
 * allowed lie about (`maxSmall` up to `maxBig`). Walking within `reach` metres
 * of one picks it up, unless it would do nothing (full charges, a shield
 * already up).
 */
export const CRATES = { firstMs: 8000, everySmall: 10_000, everyBig: 4000, maxSmall: 3, maxBig: 10, charge: 3, speedMs: 8000, reach: 1 } as const;

/* ---------------------------------- scoring --------------------------------- */

/**
 * Points: `tag` a hit, `dim` more for dimming someone, `answer` a right answer,
 * `cheer` more for a right answer while out in the final ring, `finalRing` for
 * glowing when the final ring starts and `lastGlow` for glowing at the end.
 */
export const SCORE = { tag: 100, dim: 50, answer: 10, cheer: 10, finalRing: 100, lastGlow: 200 } as const;

/* --------------------------------- Lights Out ------------------------------- */

/**
 * Lights Out: you see players within `sight` metres, your teammates, and
 * anyone who used their beam in the last `litMs`. While players are close
 * enough to see each other, walking refreshes the room's views at most every
 * `refreshMs`, so nearby players do not freeze between pulses.
 */
export const LIGHTS_OUT = { sight: 12, litMs: 2000, refreshMs: 200 } as const;

/* ------------------------------------ views --------------------------------- */

/** Bits of a player's `f` (flags) in views and pulses. */
export const FLAGS = { in: 1, safe: 2, shield: 4, speed: 8, lit: 16 } as const;

/** Leaderboard rows: the top `player` (plus you) on a phone, the top `host` on the big screen. */
export const BOARD = { player: 5, host: 10 } as const;

/** Beams stay in views for `showMs`, at most `keep` of them. */
export const BEAMS = { keep: 6, showMs: 1500 } as const;

export type TagOutcome = 'hit' | 'dimmed' | 'shield' | 'range' | 'front' | 'blocked';

/** Plain words for each tag outcome. */
export const TAG_WORDS: Record<TagOutcome, string> = {
  hit: 'Tagged!',
  dimmed: 'Tagged and dimmed!',
  shield: 'Their shield blocked it.',
  range: 'Missed: too far away.',
  front: 'Missed: not in front of you.',
  blocked: 'Missed: something was in the way.',
};

export type GlowTagAction =
  /** Walk to (x, z) facing h. Sent up to 8 times a second; the server cuts long steps short. */
  | { type: 'move'; x: number; z: number; h: number }
  /** Spend a charge on a beam at `target`. */
  | { type: 'tag'; target: string }
  | { type: 'answer'; iid: string; answer: Answer };

/**
 * A player as everyone sees them, as a short array to keep views small with
 * 40 players: [id, name, team, x, z, heading, glow, flags]. Position in metres
 * (to 0.1), heading in radians (to 0.01); in Lights Out a hidden player's x, z
 * and heading are null. Flags are FLAGS bits: in the arena, safe (just tagged
 * or relit), shield up, speed boost, lit (used their beam in the last 2 seconds).
 */
export type GlowTagPlayer = [id: string, name: string, team: string | null, x: number | null, z: number | null, h: number | null, glow: number, f: number];

export interface RingCircle {
  x: number;
  z: number;
  r: number;
}

export interface RingView extends RingCircle {
  /** The current (or last) shrink: from `from` to `to` between `startAt` and `endAt`, straight-line in game time. */
  from: RingCircle;
  to: RingCircle;
  startAt: number;
  endAt: number;
  /** The next ring, shown from the end of one shrink until the next starts. Null while a ring shrinks, and after the final ring. */
  next: (RingCircle & { startAt: number; endAt: number }) | null;
  /** Shrinks started so far, 0 to `phases`. */
  phase: number;
  phases: number;
  /** The final ring has started: nobody relights. */
  final: boolean;
  /** When the final ring starts. */
  finalAt: number;
  drainEveryMs: number;
}

export interface CrateView {
  id: number;
  kind: CrateKind;
  x: number;
  z: number;
}

/** A beam just used, for drawing a streak of light from (x1, z1) to (x2, z2). */
export interface BeamView {
  n: number;
  by: string;
  to: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  at: number;
  outcome: TagOutcome;
}

export interface BoardRow {
  id: string;
  name: string;
  team: string | null;
  score: number;
  rank: number;
  in: boolean;
  you?: true;
}

export interface TeamRow {
  id: string;
  name: string;
  hue: number;
  score: number;
  members: number;
  /** Members still glowing in the arena. */
  glowing: number;
}

export interface GlowTagYou {
  id: string;
  team: string | null;
  x: number;
  z: number;
  h: number;
  glow: number;
  maxGlow: number;
  charges: number;
  maxCharges: number;
  /** Game time the beam can be used again. */
  cooldownUntil: number;
  /** In the arena (not dimmed). */
  in: boolean;
  /** Dimmed for the rest of the game (in the final ring). */
  out: boolean;
  /** While dimmed and relighting is still allowed: right answers so far and needed. */
  relight: { have: number; need: number } | null;
  safeUntil: number;
  shield: boolean;
  speedUntil: number;
  /** Your last beam. */
  lastTag: { n: number; at: number; target: string; name: string; outcome: TagOutcome } | null;
  /** The last time you lost glow or your shield: `by` is null for the ring. */
  lastHit: { n: number; at: number; by: string | null; name: string | null; outcome: 'hit' | 'dimmed' | 'shield' } | null;
  score: number;
  rank: number;
  tags: number;
  dims: number;
  cheer: number;
  streak: number;
  question: QuestionView | null;
  last: FeedbackView | null;
}

interface GlowTagBaseView {
  /** Game time this view was drawn. */
  at: number;
  endsAt: number;
  map: ArenaMap;
  rules: { glow: number; relight: number; lightsOut: boolean; squads: boolean };
  ring: RingView;
  crates: CrateView[];
  /** Percent chance of each crate kind. */
  crateOdds: { kind: CrateKind; percent: number }[];
  /** Everyone in the game. */
  players: GlowTagPlayer[];
  beams: BeamView[];
  board: BoardRow[];
  teams: TeamRow[] | null;
  /** Players still glowing in the arena. */
  glowing: number;
  /** Present (true) in the final ring, for the room's music. */
  finalStretch?: true;
}

export interface GlowTagPlayerView extends GlowTagBaseView {
  you: GlowTagYou | null;
}

export interface GlowTagHostView extends GlowTagBaseView {
  /** Tags landed, players dimmed, relights, crates picked up, and glow lost to the ring. */
  stats: { tags: number; dims: number; relights: number; crates: number; ring: number };
}

/** One player in a pulse: [id, x×10, z×10, heading×100, FLAGS bits, glow], numbers rounded. */
export type PulseEntry = [string, number, number, number, number, number];

/**
 * Sent to every screen up to 10 times a second after quiet moves. The ring is
 * [centre x×10, centre z×10, radius×10]. In Lights Out only players everyone
 * may see (dimmed, or lit in the last 2 seconds) are listed; a screen keeps
 * nearby players from its own latest view.
 */
export interface GlowTagPulse {
  t: number;
  ring: [number, number, number];
  p: PulseEntry[];
}

/* -------------------------------- settings ------------------------------- */

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'oneGlow', label: 'One glow', help: 'Everyone has 1 glow, so one tag dims you, and 1 right answer relights you.', default: false },
  {
    kind: 'toggle',
    key: 'lightsOut',
    label: 'Lights out',
    help: 'The arena is dark: you only see players within 12 metres, your teammates, and anyone who used their beam in the last 2 seconds.',
    default: false,
  },
  { kind: 'toggle', key: 'squads', label: 'Squad relight', help: 'In a team game, a dimmed player relights beside a teammate who is still glowing.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'glow-tag-squads',
      modeId: 'glow-tag',
      title: 'Squads',
      tagline: 'Play in squads. Relight beside a teammate and keep your squad glowing.',
      changes:
        'Players are always split into teams (6 by default: choose fewer for a small group, so each squad has 2 to 4). Nobody can tag a teammate, a dimmed player relights beside a teammate who is still glowing, and the highest team total wins.',
      status: 'playable',
      thumbnail: { glyph: 'flag', hue: 200, accentHue: 160 },
    },
    settings: { squads: true },
    common: { teamCount: 6 },
    locked: ['squads'],
  },
  {
    meta: {
      id: 'glow-tag-one-glow',
      modeId: 'glow-tag',
      title: 'One Glow',
      tagline: 'One tag dims you, one right answer relights you. Frantic.',
      changes: 'Everyone has 1 glow instead of 3, so a single tag dims you, and 1 right answer relights you instead of 2.',
      status: 'playable',
      thumbnail: { glyph: 'bolt', hue: 50, accentHue: 160 },
    },
    settings: { oneGlow: true },
    locked: ['oneGlow'],
  },
  {
    meta: {
      id: 'glow-tag-lights-out',
      modeId: 'glow-tag',
      title: 'Lights Out',
      tagline: 'The park goes dark. You only see players close by, or who just used their beam.',
      changes:
        'The arena is dark. You see your teammates, players within 12 metres of you, and anyone who used their beam in the last 2 seconds. Everyone else is hidden, on phones and on the big screen.',
      status: 'playable',
      thumbnail: { glyph: 'eye', hue: 250, accentHue: 160 },
    },
    settings: { lightsOut: true },
    locked: ['lightsOut'],
  },
];
