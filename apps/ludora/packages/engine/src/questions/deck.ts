import type { Rng } from '@ludora/shared';

/**
 * A deck deals question ids in an order, reshuffling when it runs out.
 * Plain data so it can live inside mode state and be cloned.
 */
export interface Deck {
  ids: string[];
  pos: number;
  cycle: number;
  shuffle: boolean;
}

export function createDeck(ids: readonly string[], rng: Rng, shuffle: boolean): Deck {
  if (ids.length === 0) throw new Error('A deck needs at least one question');
  return { ids: shuffle ? rng.shuffle(ids) : ids.slice(), pos: 0, cycle: 0, shuffle };
}

/** Next id. When the deck wraps it is reshuffled, avoiding an immediate repeat. */
export function draw(deck: Deck, rng: Rng): string {
  if (deck.pos >= deck.ids.length) {
    const last = deck.ids[deck.ids.length - 1];
    if (deck.shuffle) {
      deck.ids = rng.shuffle(deck.ids);
      if (deck.ids.length > 1 && deck.ids[0] === last) [deck.ids[0], deck.ids[1]] = [deck.ids[1]!, deck.ids[0]!];
    }
    deck.pos = 0;
    deck.cycle++;
  }
  return deck.ids[deck.pos++]!;
}

export function remaining(deck: Deck): number {
  return deck.ids.length - deck.pos;
}
