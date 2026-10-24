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
  /** Hides a part of the screen. `part`: 'timer' | 'scores' | 'question' | 'names'. */
  hide: ['part'],
  /** A whole-screen visual treatment from LOOKS. `look`. */
  look: ['look'],
  /** A taunt from TAUNTS shown big on the target's screen. `taunt`, `from` (name). */
  taunt: ['taunt', 'from'],
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
