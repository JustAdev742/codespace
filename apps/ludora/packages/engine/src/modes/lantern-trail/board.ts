/*
 * Lantern Trail: the board. Pure data and no game logic, so the engine and the
 * screens share it (the web imports it as @ludora/engine/lantern-trail-board).
 *
 * One loop of 32 spaces round a lantern-lit town, numbered 0 to 31 clockwise
 * from the Town Gate at the bottom, plus a shortcut of 4 spaces (32 to 35). The
 * shortcut leaves the loop at the Crossroads (3) and comes back at the Clock
 * Tower (14): 5 steps instead of 11, so it saves 6, but 2 of its 4 spaces are
 * gloom puddles. The long way round has the West Pier, whose ferry crosses the
 * river to the East Pier (and back), 16 spaces on either way.
 *
 * Positions are percentages of a 3:2 board (x across, y down): the loop is an
 * oval with its spaces evenly spaced on a 3:2 screen, and the shortcut bends
 * through the town and over the river on the Old Bridge.
 */

export type SpaceKind = 'gate' | 'coins' | 'fair' | 'gloom' | 'chance' | 'ferry' | 'fork';

export interface Space {
  id: number;
  kind: SpaceKind;
  /** The landmark, so a class can follow the stall: "The stall moved to the Old Bridge." */
  name: string;
  /** Whether a sentence says "the" before the name ("the Old Bridge", but "Lantern Square"). */
  the: boolean;
  x: number;
  y: number;
  /** Where a step from here goes. Two at the Crossroads: the long way first, then the shortcut. */
  next: readonly number[];
}

/** Spaces on the loop. The shortcut's spaces come after them. */
export const LOOP = 32;
export const GATE = 0;
export const CROSSROADS = 3;
/** Where the shortcut comes back to the loop. */
export const REJOIN = 14;
export const SHORTCUT: readonly number[] = [32, 33, 34, 35];
/** The loop spaces the shortcut skips: the long way round. */
export const LONG_WAY: readonly number[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const FERRY_PAIR: readonly [number, number] = [8, 24];

type Row = [kind: SpaceKind, name: string, the: boolean, x: number, y: number];

// Hand-placed: puddles never side by side, a puddle waiting one short of each pier and of
// home, a lucky fair on each third of the loop, chance spread all the way round, and the
// long way richer (and safer) than the quick, gloomy shortcut.
const ROWS: Row[] = [
  ['gate', 'Town Gate', true, 50, 87],
  ['coins', 'Bakery Corner', false, 43.4, 86.6],
  ['chance', 'Wishing Well', true, 36.9, 85.4],
  ['fork', 'Crossroads', true, 30.5, 83.2],
  ['coins', 'Willow Walk', false, 24.3, 80.1],
  ['fair', 'Ribbon Fair', true, 18.4, 75.8],
  ['coins', 'Kite Field', false, 13.1, 70.1],
  ['gloom', 'Muddy Lane', false, 9, 62.4],
  ['ferry', 'West Pier', true, 7.3, 53],
  ['coins', 'Fishers’ Steps', false, 9, 43.6],
  ['chance', 'Story Tent', true, 13.1, 35.9],
  ['coins', 'Orchard Path', true, 18.4, 30.2],
  ['chance', 'Puppet Theatre', true, 24.3, 25.9],
  ['coins', 'Mill Pond', true, 30.5, 22.7],
  ['coins', 'Clock Tower', true, 36.9, 20.6],
  ['gloom', 'Foggy Hollow', false, 43.4, 19.4],
  ['fair', 'Lantern Square', false, 50, 19],
  ['coins', 'Tea Garden', true, 56.6, 19.4],
  ['chance', 'Mystery Door', true, 63.1, 20.6],
  ['coins', 'Candle Works', true, 69.5, 22.8],
  ['gloom', 'Drippy Arch', true, 75.7, 25.9],
  ['coins', 'Toy Workshop', true, 81.6, 30.2],
  ['chance', 'Owl Library', true, 86.9, 35.9],
  ['gloom', 'Soggy Corner', false, 91, 43.6],
  ['ferry', 'East Pier', true, 92.7, 53],
  ['coins', 'Lighthouse Steps', true, 91, 62.4],
  ['coins', 'Honey Lane', false, 86.9, 70.1],
  ['chance', 'Firework Hut', true, 81.6, 75.8],
  ['fair', 'Carousel', true, 75.7, 80.1],
  ['coins', 'Paper Crane Shop', true, 69.5, 83.3],
  ['gloom', 'Rainy Steps', true, 63.1, 85.4],
  ['coins', 'Market Steps', true, 56.6, 86.6],
  // The shortcut, from the Crossroads to the Clock Tower.
  ['gloom', 'Shadow Alley', false, 35.1, 70.7],
  ['chance', 'Old Bridge', true, 38, 58.2],
  ['gloom', 'Mossy Steps', true, 39.3, 45.7],
  ['coins', 'Lamp Lane', false, 38.9, 33.2],
];

function nextOf(id: number): number[] {
  if (id === CROSSROADS) return [CROSSROADS + 1, SHORTCUT[0]!];
  if (id === SHORTCUT[SHORTCUT.length - 1]) return [REJOIN];
  if (id >= LOOP) return [id + 1];
  return [(id + 1) % LOOP];
}

export const SPACES: readonly Space[] = ROWS.map(([kind, name, the, x, y], id) => ({ id, kind, name, the, x, y, next: nextOf(id) }));

/** "the Old Bridge", "Lantern Square": a space's name inside a sentence. */
export function placeName(id: number): string {
  const s = SPACES[id];
  return s ? `${s.the ? 'the ' : ''}${s.name}` : 'the trail';
}

// The screens read the rules' numbers and odds from here too, so they need only this one module.
export * from './meta.ts';
