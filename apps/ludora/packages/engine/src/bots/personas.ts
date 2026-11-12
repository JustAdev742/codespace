import { createRng, hashString, PERSONA_IDS, PRACTICE_LEVEL_PERSONAS, type PersonaId, type PracticeLevel, type Rng } from '@ludora/shared';
import type { BotTraits } from '../sdk/types.ts';

/*
 * Who a practice bot is: a personality (a point in a space of ability, speed,
 * consistency, nerve and attention, plus how it moves through a game) and a
 * little personal variation, so three steady bots are not triplets.
 */

export interface PersonaShape {
  /** Added to the level's ability. */
  ability: number;
  speed: number;
  consistency: number;
  nerve: number;
  attention: number;
  /** How the start of a game goes: negative is shaky (in log-odds of knowing an answer). */
  start: number;
  /** Lift near the end of a game: a second wind. */
  finish: number;
  /** How much a mistake knocks its confidence (0 shrugs it off). */
  tilt: number;
  /** Would rather guess than run out of time, 0..1. */
  guess: number;
}

export const PERSONAS: Record<PersonaId, PersonaShape> = {
  careful: { ability: 0.05, speed: 0.25, consistency: 0.8, nerve: 0.35, attention: 0.92, start: 0, finish: 0.15, tilt: 0.4, guess: 0.1 },
  quick: { ability: -0.05, speed: 0.92, consistency: 0.4, nerve: 0.7, attention: 0.45, start: 0, finish: 0, tilt: 0.3, guess: 0.6 },
  steady: { ability: 0, speed: 0.55, consistency: 0.9, nerve: 0.6, attention: 0.78, start: 0, finish: 0.05, tilt: 0.1, guess: 0.35 },
  finisher: { ability: -0.02, speed: 0.5, consistency: 0.6, nerve: 0.6, attention: 0.7, start: -0.35, finish: 0.8, tilt: 0.25, guess: 0.3 },
  nervous: { ability: 0, speed: 0.4, consistency: 0.5, nerve: 0.2, attention: 0.7, start: -0.8, finish: 0.2, tilt: 0.85, guess: 0.2 },
  guesser: { ability: -0.03, speed: 0.75, consistency: 0.5, nerve: 0.78, attention: 0.6, start: 0, finish: 0.1, tilt: 0.3, guess: 0.95 },
  dreamer: { ability: 0.05, speed: 0.45, consistency: 0.35, nerve: 0.5, attention: 0.25, start: 0, finish: 0.1, tilt: 0.2, guess: 0.3 },
};

/** What a level means: how much the bots know and how quick they are. */
export const LEVEL_SHAPES: Record<PracticeLevel, { ability: number; speed: number; pace: number }> = {
  easy: { ability: 0.24, speed: -0.2, pace: 1.35 },
  medium: { ability: 0.5, speed: 0, pace: 1 },
  hard: { ability: 0.8, speed: 0.15, pace: 0.8 },
  mixed: { ability: 0.5, speed: 0, pace: 1 },
  mine: { ability: 0.5, speed: 0, pace: 1 },
};

/** One bot: its personality, traits and pace, decided once when it joins. */
export interface BotProfile {
  persona: PersonaId;
  traits: BotTraits;
  shape: PersonaShape;
  /** Times its thinking takes, over the mode's own pace (over 1 slower). */
  pace: number;
  /** Follows the player's own accuracy and speed in this game. */
  follows: boolean;
  /** The seed of everything personal to this bot (what it happens to know, its moves). */
  seed: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A small bell-shaped wobble in [-1, 1]. */
function wobble(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next()) / 1.5 - 1;
}

export function makeProfile(persona: PersonaId, level: PracticeLevel, seed: number, ability?: number): BotProfile {
  const rng = createRng(seed ^ 0x5bd1e995);
  const shape = PERSONAS[persona];
  const lv = LEVEL_SHAPES[level];
  const base = ability ?? lv.ability;
  const traits: BotTraits = {
    ability: clamp01(base + shape.ability + wobble(rng) * 0.05),
    speed: clamp01(shape.speed + lv.speed + wobble(rng) * 0.1),
    consistency: clamp01(shape.consistency + wobble(rng) * 0.08),
    nerve: clamp01(shape.nerve + wobble(rng) * 0.1),
    attention: clamp01(shape.attention + wobble(rng) * 0.08),
  };
  return { persona, traits, shape, pace: lv.pace * (0.93 + rng.next() * 0.14), follows: level === 'mine', seed: hashString(`${seed}:mind`) };
}

/**
 * The bots for a level: their personalities and, for a mixed class, a spread of
 * ability from still learning to strong. Deterministic from `seed`.
 */
export function practiceRoster(level: PracticeLevel, count: number, seed: number): BotProfile[] {
  const rng = createRng(seed);
  const pool = rng.shuffle([...PRACTICE_LEVEL_PERSONAS[level]]);
  const out: BotProfile[] = [];
  for (let i = 0; i < count; i++) {
    // Each personality once before any repeats, so a small group is varied.
    const persona = pool[i % pool.length] ?? PERSONA_IDS[0];
    let ability: number | undefined;
    if (level === 'mixed') {
      // Spread across the class, then shuffled so the best is not always the first bot.
      const slot = count > 1 ? i / (count - 1) : 0.5;
      ability = 0.22 + slot * 0.62;
    }
    out.push(makeProfile(persona, level, hashString(`${seed}:${i}`), ability));
  }
  if (level === 'mixed') {
    const abilities = rng.shuffle(out.map((p) => p.traits.ability));
    out.forEach((p, i) => (p.traits.ability = abilities[i]!));
  }
  return out;
}
