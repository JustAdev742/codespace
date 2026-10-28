/*
 * Code Breakers passphrases: friendly word lists and the generator that
 * builds Colour-Animal-Verb-Number phrases from them (Purple-Koala-Rides-42).
 * Plain data and one pure function over a seeded Rng, so it is safe to load
 * in the browser.
 *
 * Every phrase is made the same way, so nothing tells the real password
 * apart from its decoys. Within one set the colours and animals all differ,
 * so the options are easy to tell apart on screen.
 */
import type { Rng } from '@ludora/shared';

export const COLOURS = [
  'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Silver', 'Golden', 'Teal', 'Lime', 'Coral',
  'Indigo', 'Violet', 'Amber', 'Crimson', 'Turquoise', 'Scarlet', 'Navy', 'Mint', 'Peach', 'Lilac', 'Ruby', 'Jade',
] as const;

export const ANIMALS = [
  'Koala', 'Wombat', 'Emu', 'Quokka', 'Possum', 'Echidna', 'Platypus', 'Kookaburra', 'Dingo', 'Wallaby',
  'Numbat', 'Bilby', 'Kangaroo', 'Cockatoo', 'Galah', 'Gecko', 'Dolphin', 'Turtle', 'Penguin', 'Otter',
  'Panda', 'Llama', 'Tiger', 'Zebra', 'Giraffe', 'Hippo', 'Rhino', 'Walrus', 'Badger', 'Beaver',
  'Falcon', 'Parrot', 'Octopus', 'Seahorse', 'Lobster', 'Goanna', 'Lizard', 'Pelican', 'Magpie', 'Cassowary',
] as const;

export const VERBS = [
  'Rides', 'Jumps', 'Paints', 'Sings', 'Dances', 'Skates', 'Juggles', 'Bakes', 'Reads', 'Surfs',
  'Swims', 'Climbs', 'Whistles', 'Giggles', 'Naps', 'Hops', 'Waves', 'Builds', 'Draws', 'Knits',
  'Drums', 'Sails', 'Rows', 'Bowls', 'Kicks', 'Spins', 'Dives', 'Hums', 'Plants', 'Cooks',
] as const;

/** Numbers run from 10 to 99, so every phrase has the same shape. */
export const NUMBER_RANGE = { min: 10, max: 99 } as const;

/** The colour and animal of a phrase, which a new set avoids so it looks fresh. */
export function phraseWords(phrase: string): { colour: string; animal: string } {
  const [colour = '', animal = ''] = phrase.split('-');
  return { colour, animal };
}

/**
 * `n` new passphrases, no two sharing a colour or an animal, and none using
 * a colour or animal from `avoid` (the phrases being replaced) while enough
 * fresh words remain.
 */
export function makePhrases(rng: Rng, n: number, avoid: readonly string[] = []): string[] {
  const usedColours = new Set(avoid.map((p) => phraseWords(p).colour));
  const usedAnimals = new Set(avoid.map((p) => phraseWords(p).animal));
  const fresh = <T extends string>(list: readonly T[], used: Set<string>): T => {
    const open = list.filter((w) => !used.has(w));
    const word = rng.pick(open.length ? open : list);
    used.add(word);
    return word;
  };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const colour = fresh(COLOURS, usedColours);
    const animal = fresh(ANIMALS, usedAnimals);
    const verb = rng.pick(VERBS);
    const number = rng.int(NUMBER_RANGE.min, NUMBER_RANGE.max);
    out.push(`${colour}-${animal}-${verb}-${String(number)}`);
  }
  return out;
}
