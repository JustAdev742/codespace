import { describe, expect, it } from 'vitest';
import {
  PAINT_CELLS,
  PAINT_MAX_LENGTH,
  copiesCatalogue,
  decodeDesign,
  decodePaint,
  designInputSchema,
  designSlotsFor,
  emptyPaint,
  encodeDesign,
  encodePaint,
  floodFill,
  glimArtSchema,
  paintAt,
  randomAccessoryArt,
  randomDesignArt,
  stampAt,
  DESIGN_STYLES,
  type DesignStyle,
  type PaintCell,
} from '../src/index.ts';

const base = { kind: 'glim', body: 'blob', hue: 200, accentHue: 40, saturation: 70, eyes: 'dot', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true } as const;

describe('painter data', () => {
  it('round-trips through the short run-length string', () => {
    for (let seed = 0; seed < 50; seed++) {
      let cells = emptyPaint();
      for (let i = 0; i < seed * 3; i++) cells = paintAt(cells, (i * 7 + seed) % 12, (i * 5) % 12, ((i % 5) + 1) as PaintCell, 'none');
      const s = encodePaint(cells);
      expect(decodePaint(s)).toEqual(cells);
      expect(s.length).toBeLessThanOrEqual(PAINT_MAX_LENGTH);
      expect(glimArtSchema.safeParse({ ...base, paint: s }).success).toBe(true);
    }
    expect(encodePaint(emptyPaint())).toBe('0Z0Z0K');
  });

  it('refuses data that does not fill the grid exactly, or uses other digits', () => {
    for (const bad of ['0Z0Z0J', '0Z0Z0L', '0Z0Z6K', 'abc', '0aa', '0'.repeat(145), '0Z0Z0K0']) {
      expect(glimArtSchema.safeParse({ ...base, paint: bad }).success, bad).toBe(false);
    }
    expect(decodePaint('0Z0Z0J')).toBeNull();
    expect(decodePaint('0Z0Z6K')).toBeNull();
  });

  it('mirrors strokes, fills regions and stamps shapes', () => {
    const m = paintAt(emptyPaint(), 1, 3, 2, 'mirror');
    expect(m[3 * 12 + 1]).toBe(2);
    expect(m[3 * 12 + 10]).toBe(2);
    const q = paintAt(emptyPaint(), 0, 0, 4, 'quad');
    expect([q[0], q[11], q[132], q[143]]).toEqual([4, 4, 4, 4]);
    // A wall down column 6 stops the fill.
    let w = emptyPaint();
    for (let y = 0; y < 12; y++) w = paintAt(w, 6, y, 5, 'none');
    const f = floodFill(w, 0, 0, 3);
    expect(f.filter((c) => c === 3).length).toBe(6 * 12);
    expect(f[11]).toBe(0);
    const s = stampAt(emptyPaint(), 5, 5, 'diamond', 1, 'none');
    expect(s.filter((c) => c === 1).length).toBe(13);
    expect(s.length).toBe(PAINT_CELLS);
  });
});

describe('the richer Glim schema', () => {
  it('still accepts every Glim made before (all new fields optional) and holds the shape sliders to their caps', () => {
    expect(glimArtSchema.parse(base)).toEqual(base);
    expect(glimArtSchema.safeParse({ ...base, width: 118, height: 88, eyeSize: 125 }).success).toBe(true);
    for (const bad of [{ width: 119 }, { width: 84 }, { height: 116 }, { eyeSize: 79 }, { width: 100.5 }, { feet: 'wheels' }, { idle: 'spin' }, { gradient: 'rainbow' }, { thirdHue: 360 }]) {
      expect(glimArtSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('random designs in every style are valid', () => {
    for (const style of Object.keys(DESIGN_STYLES) as DesignStyle[]) {
      for (let i = 0; i < 80; i++) expect(glimArtSchema.safeParse(randomDesignArt(`${style}${i}`, style)).success).toBe(true);
    }
    expect(randomDesignArt(5)).toEqual(randomDesignArt(5));
  });
});

describe('design names', () => {
  it('follow the display-name rules and the word filter', () => {
    expect(designInputSchema.safeParse({ kind: 'glim', name: '  Star  Pup ', art: base }).data?.name).toBe('Star Pup');
    for (const bad of ['x', 'a'.repeat(25), 'shit head', '<b>hi</b>', 'Hey‮you']) {
      const r = designInputSchema.safeParse({ kind: 'glim', name: bad, art: base });
      expect(r.success && r.data.name === bad, bad).toBe(false);
    }
    expect(designInputSchema.safeParse({ kind: 'glim', name: 'shit head', art: base }).success).toBe(false);
  });

  it('accessories must use a shape that fits their slot', () => {
    expect(designInputSchema.safeParse({ kind: 'accessory', name: 'Cap', art: { kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 3 } }).success).toBe(true);
    expect(designInputSchema.safeParse({ kind: 'accessory', name: 'Cap', art: { kind: 'accessory', slot: 'hat', shape: 'scarf', hue: 3 } }).success).toBe(false);
  });
});

describe('slots by level', () => {
  it('start at three and grow at levels 5, 10, 20 and 35', () => {
    expect(designSlotsFor(1)).toEqual({ max: 3, nextAt: 5 });
    expect(designSlotsFor(5)).toEqual({ max: 4, nextAt: 10 });
    expect(designSlotsFor(19).max).toBe(5);
    expect(designSlotsFor(35)).toEqual({ max: 7, nextAt: null });
    expect(designSlotsFor(100).max).toBe(7);
  });
});

describe('copies of catalogue items', () => {
  it('catches the same parts in nearly the same colours, and lets a design with its own markings or shape through', () => {
    expect(copiesCatalogue('glim', base, base)).toBe(true);
    expect(copiesCatalogue('glim', { ...base, hue: 210, accentHue: 30 }, base)).toBe(true);
    expect(copiesCatalogue('glim', { ...base, feet: 'nub', idle: 'bob' }, base)).toBe(true);
    expect(copiesCatalogue('glim', { ...base, hue: 230 }, base)).toBe(false);
    expect(copiesCatalogue('glim', { ...base, eyes: 'big' }, base)).toBe(false);
    expect(copiesCatalogue('glim', { ...base, width: 115 }, base)).toBe(false);
    const painted = stampAt(emptyPaint(), 5, 5, 'heart', 2, 'mirror');
    expect(copiesCatalogue('glim', { ...base, paint: encodePaint(painted) }, base)).toBe(false);
    const hat = { kind: 'accessory', slot: 'hat', shape: 'crown', hue: 44, accentHue: 200 };
    expect(copiesCatalogue('accessory', { ...hat, hue: 50 }, hat)).toBe(true);
    expect(copiesCatalogue('accessory', { ...hat, emblem: encodePaint(painted) }, hat)).toBe(false);
    expect(copiesCatalogue('accessory', { ...hat, shape: 'beanie' }, hat)).toBe(false);
  });
});

describe('design codes', () => {
  it('round-trip any valid design, and carry no name', () => {
    for (let i = 0; i < 200; i++) {
      const art = randomDesignArt(i);
      const code = encodeDesign('glim', art);
      expect(code).not.toMatch(/name/i);
      expect(decodeDesign(code)).toEqual({ kind: 'glim', art });
    }
    for (let i = 0; i < 30; i++) {
      const art = randomAccessoryArt(i);
      expect(decodeDesign(encodeDesign('accessory', art))).toEqual({ kind: 'accessory', art });
    }
  });

  it('refuse mistyped, cut-short and impossible codes', () => {
    const code = encodeDesign('glim', randomDesignArt(1));
    expect(decodeDesign(code.slice(0, -3))).toBeNull();
    const flipped = code.replace(/^G(.)/, (_m, c: string) => `G${c === '1' ? '2' : '1'}`);
    expect(decodeDesign(flipped)).toBeNull();
    expect(decodeDesign('hello')).toBeNull();
    expect(decodeDesign('x'.repeat(700))).toBeNull();
    // A body number past the end of the list, with a correct check character, is still refused.
    const body = 'Gzz.0.0.0.0.0.0.0.0.0.0.0.0.0.0.a0.1y.0.1.2s.2s.2s~';
    let h = 7;
    for (let i = 0; i < body.length; i++) h = (h * 31 + body.charCodeAt(i)) % 36;
    expect(decodeDesign(`${body}~${h.toString(36)}`)).toBeNull();
  });
});

