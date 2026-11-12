import { z } from 'zod';
import {
  ACCESSORY_SHAPES,
  ACCESSORY_SLOTS,
  GLIM_BACKS,
  GLIM_BODIES,
  GLIM_BROWS,
  GLIM_EARS,
  GLIM_EYES,
  GLIM_FACES,
  GLIM_FEET,
  GLIM_GRADIENTS,
  GLIM_IDLES,
  GLIM_MOUTHS,
  GLIM_PATTERNS,
  GLIM_SHAPE_RANGES,
  GLIM_TAILS,
  GLIM_TOPPERS,
  PAINT_SIZE,
  accessoryArtSchema,
  paintRunLength,
  glimArtSchema,
  type AccessoryArt,
  type AccessorySlot,
  type GlimArt,
} from './economy.ts';
import { cleanText, containsBlockedLanguage } from './validation.ts';
import { createRng, type Rng } from './random.ts';

/*
 * Personal designs ("My designs"): any account can design Glims and items for itself to wear.
 * They are personal (not sold, not traded, no rarity, not in the collection book) and cost nothing.
 * Every design is the Glim genome or an accessory spec plus painter data, validated here and again on
 * the server, with hard caps. No uploads and no text on a design except its name, which follows the
 * display-name rules.
 */

/* ------------------------------------------------------------------ */
/* Painter data                                                        */
/* ------------------------------------------------------------------ */

/** Cell values: 0 empty, then five palette colours (see PAINT_COLOURS). */
export type PaintCell = 0 | 1 | 2 | 3 | 4 | 5;
export const PAINT_CELLS = PAINT_SIZE * PAINT_SIZE;
/** What each painter colour is, in the design's own palette. Drawn by Ludora, so they always match the Glim. */
export const PAINT_COLOURS = [
  { value: 1, label: 'Deep body colour' },
  { value: 2, label: 'Second colour' },
  { value: 3, label: 'Third colour' },
  { value: 4, label: 'Light' },
  { value: 5, label: 'Ink' },
] as const;

export function emptyPaint(): PaintCell[] {
  return Array.from({ length: PAINT_CELLS }, () => 0 as PaintCell);
}

const RUN_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Run-length encode cells: a digit per run, then a letter for its length when longer than one (a = 2 ... Z = 53). */
export function encodePaint(cells: readonly PaintCell[]): string {
  if (cells.length !== PAINT_CELLS) throw new Error('wrong number of cells');
  let out = '';
  for (let i = 0; i < cells.length; ) {
    let j = i;
    while (j < cells.length && j - i < 53 && cells[j] === cells[i]) j++;
    const n = j - i;
    out += n === 1 ? String(cells[i]) : `${cells[i]}${RUN_LETTERS[n - 2]}`;
    i = j;
  }
  return out;
}

/** Decode painter data; null when it is not exactly one grid of valid cells. */
export function decodePaint(s: string): PaintCell[] | null {
  if (paintRunLength(s) !== PAINT_CELLS) return null;
  const out: PaintCell[] = [];
  for (const m of s.matchAll(/([0-5])([a-zA-Z]?)/g)) {
    const n = m[2] ? RUN_LETTERS.indexOf(m[2]) + 2 : 1;
    for (let k = 0; k < n; k++) out.push(Number(m[1]) as PaintCell);
  }
  return out;
}

export function isBlankPaint(s: string | undefined): boolean {
  if (!s) return true;
  const cells = decodePaint(s);
  return !cells || cells.every((c) => c === 0);
}

export type Symmetry = 'none' | 'mirror' | 'quad';

/** The cells a stroke at (x, y) touches under a symmetry: itself, its mirror, or all four quarters. */
export function symmetricCells(x: number, y: number, sym: Symmetry): [number, number][] {
  const mx = PAINT_SIZE - 1 - x;
  const my = PAINT_SIZE - 1 - y;
  const all: [number, number][] = sym === 'none' ? [[x, y]] : sym === 'mirror' ? [[x, y], [mx, y]] : [[x, y], [mx, y], [x, my], [mx, my]];
  const seen = new Set<number>();
  return all.filter(([a, b]) => {
    const k = b * PAINT_SIZE + a;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function paintAt(cells: readonly PaintCell[], x: number, y: number, value: PaintCell, sym: Symmetry): PaintCell[] {
  const out = cells.slice();
  for (const [a, b] of symmetricCells(x, y, sym)) out[b * PAINT_SIZE + a] = value;
  return out;
}

/** Flood fill the region of same-coloured cells (four-way) from (x, y), and from its mirrors under symmetry. */
export function floodFill(cells: readonly PaintCell[], x: number, y: number, value: PaintCell, sym: Symmetry = 'none'): PaintCell[] {
  const out = cells.slice();
  for (const [sx, sy] of symmetricCells(x, y, sym)) {
    const target = out[sy * PAINT_SIZE + sx];
    if (target === value) continue;
    const stack: [number, number][] = [[sx, sy]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      if (a < 0 || b < 0 || a >= PAINT_SIZE || b >= PAINT_SIZE) continue;
      const i = b * PAINT_SIZE + a;
      if (out[i] !== target) continue;
      out[i] = value;
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
  }
  return out;
}

/** Small shapes to stamp, as rows of 0/1 centred on the cell. */
export const STAMPS = {
  spot: ['01110', '11111', '11111', '11111', '01110'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
  star: ['00100', '01110', '11111', '01110', '01010'],
  stripe: ['00000', '00000', '11111', '00000', '00000'],
  zigzag: ['00000', '10001', '01010', '00100', '00000'],
  diamond: ['00100', '01110', '11111', '01110', '00100'],
} as const;
export type StampId = keyof typeof STAMPS;

export function stampAt(cells: readonly PaintCell[], x: number, y: number, stamp: StampId, value: PaintCell, sym: Symmetry): PaintCell[] {
  let out = cells.slice();
  const rows = STAMPS[stamp];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r]!.length; c++) {
      if (rows[r]![c] !== '1') continue;
      const a = x + c - 2;
      const b = y + r - 2;
      if (a < 0 || b < 0 || a >= PAINT_SIZE || b >= PAINT_SIZE) continue;
      out = paintAt(out, a, b, value, sym);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Designs                                                             */
/* ------------------------------------------------------------------ */

/** Parts added for personal designs (studio2). The catalogue does not have to use them. */
export const DESIGN_ONLY_PARTS: readonly string[] = ['button', 'lash', 'sly', 'heart', 'bean', 'zigzag', 'grit', 'twin-antennae', 'spring', 'dish', 'bobble'];

export const DESIGN_KINDS = ['glim', 'accessory'] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

/** A design's name: the display-name rules (length, characters, the word filter). Others see it on a profile. */
export const designNameSchema = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(2, 'Give it a name of at least 2 characters.')
      .max(24, 'Names can be up to 24 characters.')
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u, "Use letters, numbers, spaces and . _ - ' only.")
      .refine((v) => !containsBlockedLanguage(v), 'Pick a different name.'),
  );

export const designAccessoryArtSchema = accessoryArtSchema.refine((a) => (ACCESSORY_SHAPES[a.slot] as readonly string[]).includes(a.shape), 'That shape does not fit that slot.');

export const designInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('glim'), name: designNameSchema, art: glimArtSchema }),
  z.object({ kind: z.literal('accessory'), name: designNameSchema, art: designAccessoryArtSchema }),
]);
export type DesignInput = z.infer<typeof designInputSchema>;

/** Where a worn design goes: a Glim design is the buddy, an item its own slot. */
export const DESIGN_WEAR_SLOTS = ['buddy', ...ACCESSORY_SLOTS] as const;
export type DesignWearSlot = (typeof DESIGN_WEAR_SLOTS)[number];
export function wearSlotOf(d: { kind: DesignKind; art: unknown }): DesignWearSlot {
  return d.kind === 'glim' ? 'buddy' : (d.art as AccessoryArt).slot;
}

/** Design slots by level: three to start, one more at levels 5, 10, 20 and 35. */
export const DESIGN_SLOT_STEPS = [5, 10, 20, 35] as const;
export const DESIGN_SLOTS_START = 3;
export function designSlotsFor(level: number): { max: number; nextAt: number | null } {
  const max = DESIGN_SLOTS_START + DESIGN_SLOT_STEPS.filter((l) => level >= l).length;
  return { max, nextAt: DESIGN_SLOT_STEPS.find((l) => level < l) ?? null };
}

/* ------------------------------------------------------------------ */
/* Not a copy of something sold                                        */
/* ------------------------------------------------------------------ */

const hueGap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const none = (v: string | undefined) => v ?? 'none';

/** True when a personal design would look like this catalogue art: same parts, colours within 15 degrees, nothing of its own added. */
export function copiesCatalogue(kind: DesignKind, art: unknown, catalogue: unknown): boolean {
  if (kind === 'glim') {
    const a = glimArtSchema.safeParse(art);
    const b = glimArtSchema.safeParse(catalogue);
    if (!a.success || !b.success) return false;
    const x = a.data;
    const y = b.data;
    const parts = (g: GlimArt) => [g.body, g.eyes, g.mouth, g.pattern, g.topper, none(g.brows), none(g.ears), none(g.tail), none(g.back), none(g.face), g.feet ?? 'nub', g.gradient ?? 'none'].join('|');
    if (parts(x) !== parts(y)) return false;
    if (hueGap(x.hue, y.hue) > 15 || hueGap(x.accentHue, y.accentHue) > 15 || Math.abs((x.saturation ?? 70) - (y.saturation ?? 70)) > 12) return false;
    const own = (g: GlimArt) => !isBlankPaint(g.paint) || Math.abs((g.width ?? 100) - 100) > 6 || Math.abs((g.height ?? 100) - 100) > 6 || Math.abs((g.eyeSize ?? 100) - 100) > 8;
    return own(x) === own(y) && !own(x);
  }
  const a = accessoryArtSchema.safeParse(art);
  const b = accessoryArtSchema.safeParse(catalogue);
  if (!a.success || !b.success) return false;
  if (a.data.slot !== b.data.slot || a.data.shape !== b.data.shape) return false;
  if (!isBlankPaint(a.data.emblem)) return false;
  if (hueGap(a.data.hue, b.data.hue) > 15) return false;
  if (a.data.accentHue !== undefined && b.data.accentHue !== undefined && hueGap(a.data.accentHue, b.data.accentHue) > 15) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Design codes                                                        */
/* ------------------------------------------------------------------ */

/*
 * A design code is the look only (never the name), as short text a person can copy: a version letter,
 * then numbers in base 36 joined by dots (choices are positions in the vocabulary lists), then the
 * painter data, then a check character. Decoding runs the result through the schema like anything else.
 */

const GLIM_FIELDS = [
  ['body', GLIM_BODIES],
  ['eyes', GLIM_EYES],
  ['mouth', GLIM_MOUTHS],
  ['pattern', GLIM_PATTERNS],
  ['topper', GLIM_TOPPERS],
  ['brows', GLIM_BROWS],
  ['ears', GLIM_EARS],
  ['tail', GLIM_TAILS],
  ['back', GLIM_BACKS],
  ['face', GLIM_FACES],
  ['feet', GLIM_FEET],
  ['gradient', GLIM_GRADIENTS],
  ['idle', GLIM_IDLES],
] as const;

function check(s: string): string {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 36;
  return h.toString(36);
}

export function encodeDesign(kind: DesignKind, art: GlimArt | AccessoryArt): string {
  let body: string;
  if (kind === 'glim') {
    const g = art as GlimArt;
    const nums = [
      ...GLIM_FIELDS.map(([k, list]) => Math.max(0, (list as readonly string[]).indexOf(((g as Record<string, unknown>)[k] as string | undefined) ?? list[0]!))),
      g.hue,
      g.accentHue,
      g.thirdHue ?? 360,
      g.saturation ?? 70,
      g.cheeks ? 1 : 0,
      g.width ?? 100,
      g.height ?? 100,
      g.eyeSize ?? 100,
    ];
    body = `G${nums.map((n) => n.toString(36)).join('.')}~${g.paint ?? ''}`;
  } else {
    const a = art as AccessoryArt;
    const nums = [ACCESSORY_SLOTS.indexOf(a.slot), (ACCESSORY_SHAPES[a.slot] as readonly string[]).indexOf(a.shape), a.hue, a.accentHue ?? 360];
    body = `A${nums.map((n) => n.toString(36)).join('.')}~${a.emblem ?? ''}`;
  }
  return `${body}~${check(body)}`;
}

export type DecodedDesign = { kind: 'glim'; art: GlimArt } | { kind: 'accessory'; art: AccessoryArt };

/** Read a design code; null when it is not a valid code (mistyped, cut short, or an impossible design). */
export function decodeDesign(code: string): DecodedDesign | null {
  const s = code.replace(/\s+/g, '');
  if (s.length > 600) return null;
  const m = /^([GA])([0-9a-z.]+)~([0-9a-zA-Z]*)~([0-9a-z])$/.exec(s);
  if (!m) return null;
  const body = `${m[1]}${m[2]}~${m[3]}`;
  if (check(body) !== m[4]) return null;
  const nums = m[2]!.split('.').map((x) => parseInt(x, 36));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const paint = m[3] ? m[3] : undefined;
  if (m[1] === 'G') {
    if (nums.length !== GLIM_FIELDS.length + 8) return null;
    const art: Record<string, unknown> = { kind: 'glim' };
    GLIM_FIELDS.forEach(([k, list], i) => {
      art[k] = (list as readonly string[])[nums[i]!];
    });
    const [hue, accentHue, thirdHue, saturation, cheeks, width, height, eyeSize] = nums.slice(GLIM_FIELDS.length) as number[];
    Object.assign(art, { hue, accentHue, saturation, cheeks: cheeks === 1 });
    if (thirdHue !== 360) art.thirdHue = thirdHue;
    if (width !== 100) art.width = width;
    if (height !== 100) art.height = height;
    if (eyeSize !== 100) art.eyeSize = eyeSize;
    if (paint) art.paint = paint;
    const r = glimArtSchema.safeParse(art);
    return r.success ? { kind: 'glim', art: tidyGlim(r.data) } : null;
  }
  if (nums.length !== 4) return null;
  const slot = ACCESSORY_SLOTS[nums[0]!];
  if (!slot) return null;
  const art: Record<string, unknown> = { kind: 'accessory', slot, shape: (ACCESSORY_SHAPES[slot] as readonly string[])[nums[1]!], hue: nums[2] };
  if (nums[3] !== 360) art.accentHue = nums[3];
  if (paint) art.emblem = paint;
  const r = designAccessoryArtSchema.safeParse(art);
  return r.success ? { kind: 'accessory', art: r.data } : null;
}

/** Drop optional fields that say the same as leaving them out, so equal looks compare equal. */
export function tidyGlim(g: GlimArt): GlimArt {
  const out: GlimArt = { ...g };
  const drop = <K extends keyof GlimArt>(k: K, when: unknown) => {
    if (out[k] === when) delete out[k];
  };
  drop('feet', 'nub');
  drop('gradient', 'none');
  drop('idle', 'calm');
  drop('width', 100);
  drop('height', 100);
  drop('eyeSize', 100);
  if (isBlankPaint(out.paint)) delete out.paint;
  return out;
}

/* ------------------------------------------------------------------ */
/* Random designs, within a style                                      */
/* ------------------------------------------------------------------ */

export const DESIGN_STYLES = {
  any: { label: 'Anything' },
  cute: { label: 'Cute' },
  spooky: { label: 'Spooky' },
  robot: { label: 'Robot' },
  nature: { label: 'Nature' },
  sea: { label: 'Sea' },
} as const;
export type DesignStyle = keyof typeof DESIGN_STYLES;

type Pool = { [K in 'body' | 'eyes' | 'mouth' | 'topper' | 'ears' | 'tail' | 'back' | 'face' | 'pattern' | 'feet']?: readonly string[] } & { hues?: readonly [number, number]; sat?: readonly [number, number] };

const POOLS: Record<Exclude<DesignStyle, 'any'>, Pool> = {
  cute: { body: ['blob', 'bean', 'cloud', 'dumpling', 'fluff', 'cat', 'orb', 'bell'], eyes: ['big', 'sparkle', 'happy', 'dot', 'button', 'lash', 'heart'], mouth: ['smile', 'cat', 'o', 'bean', 'tongue'], ears: ['cat', 'bunny', 'bear', 'mouse', 'round', 'none'], topper: ['none', 'bud', 'clover', 'bobble', 'rose', 'tuft'], tail: ['none', 'curl', 'pom', 'ribbon'], feet: ['nub', 'paws', 'tiptoes'], pattern: ['none', 'belly', 'spots', 'freckles', 'sprinkles'], sat: [55, 90] },
  spooky: { body: ['ghost', 'moth', 'flame', 'drop', 'lantern', 'jelly'], eyes: ['half', 'sly', 'cyclops', 'dot', 'curious'], mouth: ['fang', 'zigzag', 'grit', 'wobble', 'none'], ears: ['tufts', 'feelers', 'none'], topper: ['horns', 'tendrils', 'moon', 'steam', 'none'], tail: ['none', 'dragon', 'spiral', 'zigzag'], back: ['bat', 'none', 'cape'], feet: ['none', 'claws', 'nub'], pattern: ['none', 'stripes', 'drip', 'split'], hues: [240, 320], sat: [20, 60] },
  robot: { body: ['box', 'bulb', 'orb', 'book', 'crystal'], eyes: ['pixel', 'visor', 'cyclops', 'button'], mouth: ['grit', 'zigzag', 'none', 'o'], ears: ['bolts', 'feelers', 'none'], topper: ['antenna', 'twin-antennae', 'spring', 'dish', 'bolt'], tail: ['plug', 'none'], face: ['screen', 'none'], feet: ['boots', 'nub', 'none'], pattern: ['circuit', 'bands', 'none'], sat: [15, 55] },
  nature: { body: ['sprout', 'mushroom', 'bean', 'drop', 'blob', 'owl'], eyes: ['dot', 'sleepy', 'happy', 'curious', 'lash'], mouth: ['smile', 'o', 'beak', 'bean'], ears: ['leaf', 'petals', 'antlers', 'none'], topper: ['leaf', 'sprout', 'fern', 'berries', 'rose', 'stem'], tail: ['none', 'fox', 'curl', 'pom'], feet: ['nub', 'paws', 'tiptoes'], pattern: ['spots', 'belly', 'freckles', 'patch', 'none'], hues: [70, 160], sat: [45, 80] },
  sea: { body: ['jelly', 'drop', 'blob', 'bean', 'orb'], eyes: ['big', 'dot', 'sparkle', 'button'], mouth: ['o', 'smile', 'bean', 'wobble'], ears: ['fin', 'none'], topper: ['kelp', 'shell', 'coral', 'lure', 'none'], tail: ['fish', 'none', 'curl'], feet: ['flippers', 'none', 'nub'], pattern: ['bubbles', 'stripes', 'spots', 'none'], hues: [170, 240], sat: [50, 90] },
};

function pickFrom<T extends string>(rng: Rng, pool: readonly string[] | undefined, all: readonly T[]): T {
  const usable = (pool ?? all).filter((v) => (all as readonly string[]).includes(v));
  return rng.pick(usable.length ? usable : all) as T;
}

/** A random Glim design, valid against the schema, within a style. Seeded, so sheets and tests repeat. */
export function randomDesignArt(seed: number | string, style: DesignStyle = 'any'): GlimArt {
  const rng = createRng(seed);
  const p: Pool = style === 'any' ? {} : POOLS[style];
  const [h0, h1] = p.hues ?? [0, 359];
  const hue = rng.int(h0, h1) % 360;
  const [s0, s1] = p.sat ?? [25, 95];
  const paint = rng.chance(0.4) ? randomPaint(rng) : undefined;
  const art: GlimArt = {
    kind: 'glim',
    body: pickFrom(rng, p.body, GLIM_BODIES),
    hue,
    accentHue: (hue + rng.int(60, 300)) % 360,
    saturation: rng.int(s0, s1),
    eyes: pickFrom(rng, p.eyes, GLIM_EYES),
    mouth: pickFrom(rng, p.mouth, GLIM_MOUTHS),
    pattern: paint ? 'none' : pickFrom(rng, p.pattern, GLIM_PATTERNS),
    topper: rng.chance(style === 'any' ? 0.6 : 0.8) ? pickFrom(rng, p.topper, GLIM_TOPPERS) : 'none',
    cheeks: rng.chance(0.5),
    brows: pickFrom(rng, undefined, GLIM_BROWS),
    ears: rng.chance(0.55) ? pickFrom(rng, p.ears, GLIM_EARS) : 'none',
    tail: rng.chance(0.45) ? pickFrom(rng, p.tail, GLIM_TAILS) : 'none',
    back: rng.chance(p.back ? 0.5 : 0.25) ? pickFrom(rng, p.back, GLIM_BACKS) : 'none',
    face: rng.chance(p.face ? 0.4 : 0.12) ? pickFrom(rng, p.face, GLIM_FACES) : 'none',
    feet: pickFrom(rng, p.feet, GLIM_FEET),
    width: rng.int(GLIM_SHAPE_RANGES.width[0], GLIM_SHAPE_RANGES.width[1]),
    height: rng.int(GLIM_SHAPE_RANGES.height[0], GLIM_SHAPE_RANGES.height[1]),
    eyeSize: rng.int(GLIM_SHAPE_RANGES.eyeSize[0], GLIM_SHAPE_RANGES.eyeSize[1]),
    gradient: rng.chance(0.35) ? pickFrom(rng, undefined, GLIM_GRADIENTS) : 'none',
    idle: pickFrom(rng, undefined, GLIM_IDLES),
    ...(rng.chance(0.4) ? { thirdHue: rng.int(0, 359) } : {}),
    ...(paint ? { paint } : {}),
  };
  return tidyGlim(art);
}

/** Random symmetric markings: a few stamps and stripes mirrored left to right. */
function randomPaint(rng: Rng): string {
  let cells = emptyPaint();
  const stamps = Object.keys(STAMPS) as StampId[];
  const n = rng.int(1, 4);
  for (let i = 0; i < n; i++) cells = stampAt(cells, rng.int(1, 5), rng.int(2, 10), rng.pick(stamps), rng.int(1, 4) as PaintCell, 'mirror');
  return encodePaint(cells);
}

/** A random accessory design for a slot. */
export function randomAccessoryArt(seed: number | string, slot?: AccessorySlot): AccessoryArt {
  const rng = createRng(seed);
  const s = slot ?? rng.pick(ACCESSORY_SLOTS);
  return { kind: 'accessory', slot: s, shape: rng.pick(ACCESSORY_SHAPES[s]), hue: rng.int(0, 359), accentHue: rng.int(0, 359) };
}
