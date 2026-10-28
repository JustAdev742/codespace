/*
 * Big Catch: the waters and the fish that live in them. Plain data only, so
 * the screens can draw species cards and odds without bundling game logic.
 *
 * The fish are Australian favourites plus one made-up legend per water. The
 * blurbs are a bit of fun, not facts to learn: the learning in Ludora comes
 * from the host's question set. Weights and sizes are the game's own.
 */

export const WATERS = ['river', 'estuary', 'reef'] as const;
export type WaterId = (typeof WATERS)[number];

export const WATER_INFO: Record<WaterId, { label: string; blurb: string; hue: number }> = {
  river: { label: 'River', blurb: 'Slow brown water, sunken logs and deep, dark holes.', hue: 140 },
  estuary: { label: 'Estuary', blurb: 'Sand flats, mangroves and weed beds where the river meets the sea.', hue: 175 },
  reef: { label: 'Reef', blurb: 'Clear blue water over rocks and coral, a long way out.', hue: 205 },
};

/** How often a species bites, from most to least often. Lures and Golden Hour favour the rarer tiers. */
export const RARITIES = ['common', 'uncommon', 'rare', 'legend'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_INFO: Record<Rarity, { label: string; stars: 1 | 2 | 3 | 4 }> = {
  common: { label: 'Common', stars: 1 },
  uncommon: { label: 'Uncommon', stars: 2 },
  rare: { label: 'Rare', stars: 3 },
  legend: { label: 'Legend', stars: 4 },
};

/** A hint for the renderer: which model to draw. */
export type SpeciesShape = 'fish' | 'catfish' | 'flatfish' | 'crayfish' | 'crab';

export type SpeciesId =
  | 'carp'
  | 'redfin'
  | 'yabby'
  | 'goldenPerch'
  | 'australianBass'
  | 'catfish'
  | 'murrayCod'
  | 'oldMossback'
  | 'bream'
  | 'sandWhiting'
  | 'luderick'
  | 'flathead'
  | 'mudCrab'
  | 'mulloway'
  | 'silverGhost'
  | 'leatherjacket'
  | 'trevally'
  | 'snapper'
  | 'coralTrout'
  | 'redEmperor'
  | 'glimmerfin';

export interface Species {
  id: SpeciesId;
  name: string;
  water: WaterId;
  rarity: Rarity;
  /** Base chance of a bite in its water, out of 100 (each water's species add up to 100). */
  weight: number;
  /** Weight range in kilograms. Most fish come up near the light end; big ones are rare. */
  kg: readonly [number, number];
  /** Length (or shell width) at the lightest and heaviest weights, in centimetres, for drawing the fish to scale. */
  cm: readonly [number, number];
  measure: 'length' | 'shell';
  /** A line of flavour for the species card. */
  blurb: string;
  shape: SpeciesShape;
  /** Main body colour for cards and models. */
  hue: number;
}

export const SPECIES: readonly Species[] = [
  /* --------------------------------- river --------------------------------- */
  { id: 'carp', name: 'Common carp', water: 'river', rarity: 'common', weight: 22, kg: [0.5, 5], cm: [30, 68], measure: 'length', blurb: 'Gulps at everything. Has never once said no to a snack.', shape: 'fish', hue: 40 },
  { id: 'redfin', name: 'Redfin perch', water: 'river', rarity: 'common', weight: 15.4, kg: [0.2, 2], cm: [22, 46], measure: 'length', blurb: 'Stripy, spiky and always in a hurry.', shape: 'fish', hue: 12 },
  { id: 'yabby', name: 'Yabby', water: 'river', rarity: 'common', weight: 18, kg: [0.05, 0.3], cm: [10, 20], measure: 'length', blurb: 'Waves its claws at you like it owns the river.', shape: 'crayfish', hue: 220 },
  { id: 'goldenPerch', name: 'Golden perch', water: 'river', rarity: 'uncommon', weight: 17, kg: [0.5, 6], cm: [30, 60], measure: 'length', blurb: 'Flashes like a gold coin when it turns.', shape: 'fish', hue: 48 },
  { id: 'australianBass', name: 'Australian bass', water: 'river', rarity: 'uncommon', weight: 12, kg: [0.3, 2.5], cm: [25, 52], measure: 'length', blurb: 'Hits hard and fights all the way to the bank.', shape: 'fish', hue: 70 },
  { id: 'catfish', name: 'Catfish', water: 'river', rarity: 'uncommon', weight: 9, kg: [0.4, 4], cm: [33, 70], measure: 'length', blurb: 'Whiskers first, questions later.', shape: 'catfish', hue: 30 },
  { id: 'murrayCod', name: 'Murray cod', water: 'river', rarity: 'rare', weight: 6, kg: [1.5, 25], cm: [45, 110], measure: 'length', blurb: 'The heavyweight of the river. Bring a bigger net.', shape: 'fish', hue: 95 },
  { id: 'oldMossback', name: 'Old Mossback', water: 'river', rarity: 'legend', weight: 0.6, kg: [20, 40], cm: [120, 160], measure: 'length', blurb: 'A cod so old that weed grows on its back. Most people think it is only a story.', shape: 'fish', hue: 110 },

  /* -------------------------------- estuary -------------------------------- */
  { id: 'bream', name: 'Yellowfin bream', water: 'estuary', rarity: 'common', weight: 24, kg: [0.2, 1.6], cm: [20, 42], measure: 'length', blurb: 'Nibbles your bait, then acts as if nothing happened.', shape: 'fish', hue: 50 },
  { id: 'sandWhiting', name: 'Sand whiting', water: 'estuary', rarity: 'common', weight: 20, kg: [0.1, 0.8], cm: [22, 44], measure: 'length', blurb: 'Zooms over the sand flats like it is late for school.', shape: 'fish', hue: 45 },
  { id: 'luderick', name: 'Luderick', water: 'estuary', rarity: 'common', weight: 15.4, kg: [0.3, 2.2], cm: [25, 50], measure: 'length', blurb: 'Would rather have a salad than a worm, thank you.', shape: 'fish', hue: 215 },
  { id: 'flathead', name: 'Dusky flathead', water: 'estuary', rarity: 'uncommon', weight: 19, kg: [0.3, 6], cm: [33, 90], measure: 'length', blurb: 'Hides in the sand with only its eyes poking out.', shape: 'flatfish', hue: 35 },
  { id: 'mudCrab', name: 'Mud crab', water: 'estuary', rarity: 'uncommon', weight: 13, kg: [0.3, 2.5], cm: [12, 22], measure: 'shell', blurb: 'All claws and no manners.', shape: 'crab', hue: 160 },
  { id: 'mulloway', name: 'Mulloway', water: 'estuary', rarity: 'rare', weight: 8, kg: [2, 25], cm: [60, 145], measure: 'length', blurb: 'Big, silver and in no hurry to be caught.', shape: 'fish', hue: 210 },
  { id: 'silverGhost', name: 'The Silver Ghost', water: 'estuary', rarity: 'legend', weight: 0.6, kg: [20, 40], cm: [150, 190], measure: 'length', blurb: 'Seen by many, landed by almost nobody.', shape: 'fish', hue: 200 },

  /* ---------------------------------- reef --------------------------------- */
  { id: 'leatherjacket', name: 'Leatherjacket', water: 'reef', rarity: 'common', weight: 26, kg: [0.2, 1.5], cm: [20, 45], measure: 'length', blurb: 'Tiny mouth, tough skin, and steals bait like a professional.', shape: 'fish', hue: 80 },
  { id: 'trevally', name: 'Silver trevally', water: 'reef', rarity: 'common', weight: 22.4, kg: [0.3, 3], cm: [25, 60], measure: 'length', blurb: 'Never goes anywhere without the rest of its gang.', shape: 'fish', hue: 190 },
  { id: 'snapper', name: 'Snapper', water: 'reef', rarity: 'uncommon', weight: 23, kg: [0.4, 8], cm: [25, 82], measure: 'length', blurb: 'Pink, proud and showing off a very fine forehead.', shape: 'fish', hue: 350 },
  { id: 'coralTrout', name: 'Coral trout', water: 'reef', rarity: 'uncommon', weight: 16, kg: [0.8, 7], cm: [35, 80], measure: 'length', blurb: 'Covered in blue spots, as if someone flicked paint at it.', shape: 'fish', hue: 5 },
  { id: 'redEmperor', name: 'Red emperor', water: 'reef', rarity: 'rare', weight: 12, kg: [1, 12], cm: [35, 90], measure: 'length', blurb: 'Bright red and sure that it rules the reef.', shape: 'fish', hue: 0 },
  { id: 'glimmerfin', name: 'Glimmerfin', water: 'reef', rarity: 'legend', weight: 0.6, kg: [15, 35], cm: [110, 150], measure: 'length', blurb: 'Glows like a lantern in deep water. Nobody knows where it sleeps.', shape: 'fish', hue: 52 },
];

const BY_ID = new Map<string, Species>(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): Species | undefined {
  return BY_ID.get(id);
}

/** The species of one water, in table order (most common first). */
export function speciesOf(water: WaterId): Species[] {
  return SPECIES.filter((s) => s.water === water);
}
