/*
 * The overlay kinds the web app knows how to draw on a player's screen. A
 * cheat's overlay() returns one of these; the engine adds `eid` and
 * `endsAt`. Anything else is ignored by the client, so keep to this list.
 */

export const OVERLAY_KINDS = {
  /** A small chip near the top of the screen. `text`, `tone`: 'good' | 'bad' | 'info'. */
  badge: ['text', 'tone'],
  /** A chip with a live countdown. `label`, `until` (game time). */
  countdown: ['label', 'until'],
  /** A large message across the game for a moment. `text`, `tone`. */
  banner: ['text', 'tone'],
  /** Highlights the correct answer to question `iid`. `reveal`: the answer in tokens. */
  peek: ['iid', 'reveal'],
  /** Hides these choice tokens on question `iid`. */
  'hide-choices': ['iid', 'tokens'],
  /** Marks a choice token on question `iid` as forbidden. */
  'forbid-choice': ['iid', 'token'],
  /** How many players picked each choice token so far on question `iid`. `counts`. */
  tally: ['iid', 'counts'],
  /** Shows which choice `token` a named player picked on question `iid`. `name`. */
  spy: ['iid', 'token', 'name'],
  /** Removes one player's row from leaderboards (not on that player's own screen). `playerId`. */
  'hide-player': ['playerId'],
  /** Hides a part of the screen. `part`: 'timer' | 'scores' | 'question' | 'names'. */
  hide: ['part'],
  /** A whole-screen visual treatment from LOOKS. `look`. */
  look: ['look'],
  /** A taunt from TAUNTS shown big on the target's screen. `taunt`, `from` (the caster's player id). */
  taunt: ['taunt', 'from'],
  /** Shows names on the wrong rows of leaderboards. `map`: player id → the id whose name to show. */
  'swap-names': ['map'],
  /** Makes one player's name glow on leaderboards. `playerId`. */
  'glow-player': ['playerId'],
} as const;

export type OverlayKind = keyof typeof OVERLAY_KINDS;

/** Taunts are fixed lines (players never type text into another player's screen). */
export const TAUNTS = {
  'too-easy': 'Too easy!',
  'catch-me': 'Catch me if you can!',
  'nice-try': 'Nice try!',
  'is-that-all': 'Is that all you\'ve got?',
  'see-you': 'See you at the finish!',
  'gg': 'Good game... for me!',
} as const;

/**
 * Whole-screen looks, by group. Looks in the same group replace each other
 * on one player (a screen cannot be upside down and sideways at once).
 * Every look is drawn by the web app's chaos layer; animated looks have a
 * still version for players who ask for reduced motion, and none flash.
 */
export const LOOKS = {
  transform: ['upside-down', 'mirror', 'tilt', 'tiny', 'zoom', 'squash', 'stretch', 'spin', 'wobble', 'seasick', 'sideways', 'skew'],
  filter: ['blur', 'old-movie', 'invert', 'hue-spin', 'night', 'washed', 'pixelate', 'thermal', 'sepia'],
  weather: ['snow', 'bubbles', 'leaves', 'rain', 'confetti', 'fireflies', 'glim-parade', 'balloons', 'paper-planes', 'disco'],
  block: ['fog', 'sticky-notes', 'mud', 'cobwebs', 'flashlight', 'peephole', 'blinds', 'curtain', 'ink', 'frost'],
  text: ['comic-font', 'microprint', 'jumble', 'typewriter', 'backwards', 'wavy', 'caps'],
  ui: ['dodge', 'shrink-buttons', 'colour-swap', 'musical-buttons', 'ghost-buttons', 'reverse-choices', 'vanishing-question', 'quake'],
} as const;

export type LookGroup = keyof typeof LOOKS;
export type Look = (typeof LOOKS)[LookGroup][number];
