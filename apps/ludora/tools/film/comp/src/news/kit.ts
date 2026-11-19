// What every scene of "What's new" shares: the school's colours, captions in its typeface, plates,
// close-ups of a filmed page, and the small moves that tie pictures to the beat.
import { CanvasTexture, Group, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Texture } from 'three';
import { Card, Clip, alignWords, clamp01, ease, loadTexture, riseIn, seg, words, type TextMesh, type TextOptions } from '../engine.ts';

export const C = {
  cream: '#f6ecd2', paper: '#fffdf8', green: '#00a766', mint: '#5fdcaa', deep: '#083a2b', night: '#031611', ink: '#0a2a1e',
  red: '#f04b65', gold: '#ffc233', amber: '#ffc24d', coral: '#ff8a78', calm: '#9be27a', term: '#0a1a1c', termText: '#efe6cf',
};
const SHADOW = 'rgba(1,14,9,0.9)';

export interface Line { group: Group; items: TextMesh[]; width: number; show(t: number, out?: number): void }

/** A caption on the camera-fixed layer, in the school's typeface. `align` puts its left or right edge at x. */
export function line(str: string, x: number, y: number, o: Partial<TextOptions> & { align?: 'left' | 'right' | 'center' } = {}): Line {
  const set = words(str, { size: 92, font: 'lato', weight: 900, color: C.cream, shadow: true, shadowColor: SHADOW, tracking: -1, ...o }, 0.27);
  if (o.align === 'left' || o.align === 'right') alignWords(set, o.align);
  set.group.position.set(x, y, 0);
  return { ...set, show(t, out = Infinity) { riseIn(set.items, t, { out, each: 0.06, dur: 0.4, rise: 40 }); set.group.visible = t > -0.01; } };
}

/** A smaller second line under a caption. */
export const sub = (str: string, x: number, y: number, o: Partial<TextOptions> & { align?: 'left' | 'right' | 'center' } = {}) =>
  line(str, x, y, { size: 50, weight: 700, color: C.mint, tracking: 0, ...o });

export interface Plate { mesh: Mesh<PlaneGeometry, MeshBasicMaterial>; w: number; h: number; show(t: number, out?: number): void }

/** A leaning plate with a name on it, the way the game labels a question: the film's section mark. */
export function plate(str: string, o: { size?: number; bg?: string; fg?: string; lean?: number } = {}): Plate {
  const size = o.size ?? 56, SS = 2, lean = o.lean ?? 0.18;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `900 ${size * SS}px "Lato"`;
  ctx.font = font;
  const tw = ctx.measureText(str).width;
  const padX = size * 0.62 * SS, hgt = size * 1.72 * SS, slant = hgt * lean;
  c.width = Math.ceil(tw + padX * 2 + slant + 8);
  c.height = Math.ceil(hgt + 8);
  ctx.translate(4, 4);
  ctx.fillStyle = o.bg ?? C.cream;
  ctx.beginPath();
  const r = 12 * SS, w = tw + padX * 2 + slant;
  ctx.moveTo(slant + r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w - slant * 0.12, r);
  ctx.lineTo(w - slant + slant * 0.12, hgt - r); ctx.quadraticCurveTo(w - slant, hgt, w - slant - r, hgt);
  ctx.lineTo(r, hgt); ctx.quadraticCurveTo(0, hgt, slant * 0.12, hgt - r); ctx.lineTo(slant - slant * 0.12, r); ctx.quadraticCurveTo(slant, 0, slant + r, 0);
  ctx.fill();
  ctx.font = font; ctx.fillStyle = o.fg ?? C.ink; ctx.textBaseline = 'middle';
  ctx.fillText(str, padX + slant / 2, hgt / 2 + size * 0.06 * SS);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = LinearMipmapLinearFilter; tex.anisotropy = 8;
  const mesh = new Mesh(new PlaneGeometry(c.width / SS, c.height / SS), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = 22;
  const W0 = c.width / SS, H0 = c.height / SS;
  return {
    mesh, w: W0, h: H0,
    show(t, out = Infinity) {
      const p = ease.outBack(seg(t, 0, 0.34), 1.6), gone = seg(t, out, out + 0.2);
      mesh.visible = t >= 0 && gone < 1;
      mesh.scale.set(Math.max(0.001, p), 0.7 + 0.3 * p, 1);
      mesh.material.opacity = clamp01(seg(t, 0, 0.12)) * (1 - gone);
    },
  };
}

/** Puts a plate on the hud with its left edge at x (plates grow from their centre, so this keeps the edge still enough). */
export function place(p: Plate, x: number, y: number) { p.mesh.position.set(x + p.w / 2, y, 0); return p; }

/** Plays a clip on a card: clip frame `from` at t = 0, `speed` times real time. */
export function roll(clip: Clip, card: Card, t: number, { from = 1, speed = 1, crop, hold = false, to }: { from?: number; speed?: number; crop?: [number, number, number, number]; hold?: boolean; to?: number } = {}): Promise<unknown> {
  let f = from + Math.max(0, t) * 30 * speed;
  if (to !== undefined) f = Math.min(f, to);
  return clip.frame(hold || to !== undefined ? Math.min(f, clip.frames) : f).then((tex: Texture | null) => card.show(tex, crop));
}

/** The nudge a cut gives the camera: 1 at the cut, gone in a quarter of a second. */
export const punch = (t: number, rate = 9) => (t < 0 ? 0 : Math.exp(-t * rate));
/** 0 (away) to 1 (in place), with a soft landing. */
export const arrive = (t: number, at = 0, dur = 0.5) => ease.outCubic(seg(t, at, at + dur));
export const pop = (t: number, at = 0, dur = 0.45) => ease.outBack(seg(t, at, at + dur), 1.5);

/** A still picture from the stills folder, or null when it has not been shot. */
export async function still(name: string): Promise<Texture | null> {
  try { return await loadTexture(`/media/stills/${name}.png`); } catch { return null; }
}
/** A picture's own width and height in pixels. */
export const sizeOf = (t: Texture | null): [number, number] => { const i = t?.image as { width: number; height: number } | undefined; return i ? [i.width, i.height] : [16, 9]; };

/** A card that shows part of a picture (a close-up), with a cream edge. `crop` is left, top, right, bottom as fractions. */
export function closeUp(tex: Texture | null, crop: [number, number, number, number], w: number, o: { radius?: number; rim?: number; glow?: string; shadow?: number } = {}) {
  const [iw, ih] = sizeOf(tex);
  const h = (w * ((crop[3] - crop[1]) * ih)) / ((crop[2] - crop[0]) * iw);
  const card = new Card({ w, h, radius: o.radius ?? 22, rim: o.rim ?? 3, rimColor: C.cream, shadow: o.shadow ?? 0.7, color: C.paper, ...(o.glow ? { glow: o.glow } : {}) });
  card.show(tex, crop);
  return card;
}

/** A full picture on a card of width w. */
export function picture(tex: Texture | null, w: number, o: { radius?: number; rim?: number; glow?: string; shadow?: number; rimColor?: string } = {}) {
  const [iw, ih] = sizeOf(tex);
  const card = new Card({ w, h: (w * ih) / iw, radius: o.radius ?? 20, rim: o.rim ?? 0, rimColor: o.rimColor ?? C.cream, shadow: o.shadow ?? 0.7, color: C.night, ...(o.glow ? { glow: o.glow } : {}) });
  card.show(tex);
  return card;
}

/** A school logo or crest as a flat picture on a white plate, for the title and the end. */
export async function schoolPlate(height: number): Promise<Group> {
  const g = new Group();
  const img = new Image();
  img.src = '/schools/hills-grammar/logo-colour.svg';
  await img.decode().catch(() => {});
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2.4;
  const SS = 3, ih = height * 0.72, iw = ih * ratio, padX = height * 0.3;
  const c = document.createElement('canvas');
  c.width = Math.ceil((iw + padX * 2) * SS); c.height = Math.ceil(height * SS);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, height * 0.22 * SS); ctx.fill();
  if (img.naturalWidth) ctx.drawImage(img, padX * SS, (height - ih) / 2 * SS, iw * SS, ih * SS);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = LinearMipmapLinearFilter; tex.anisotropy = 8;
  const m = new Mesh(new PlaneGeometry(c.width / SS, c.height / SS), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 21;
  g.add(m);
  g.userData.w = c.width / SS; g.userData.h = height;
  return g;
}

export interface SheetLine { t: string; color?: string; weight?: number; size?: number; gap?: number; font?: 'mono' | 'lato' }

/** A sheet of text drawn as a picture (a message, a notification): lines wrap to the width. Returns the card and its height. */
export function sheet(lines: SheetLine[], w: number, o: { bg?: string; pad?: number; radius?: number; rimColor?: string; rim?: number; size?: number; glow?: string } = {}) {
  const SS = 2, pad = (o.pad ?? 34) * SS, base = o.size ?? 26;
  const fontOf = (l: SheetLine) => `${l.weight ?? 400} ${(l.size ?? base) * SS}px ${l.font === 'lato' ? '"Lato"' : '"DejaVu Sans Mono", "Liberation Mono", monospace'}`;
  const probe = document.createElement('canvas').getContext('2d')!;
  const rows: { text: string; l: SheetLine; y: number }[] = [];
  let y = pad;
  for (const l of lines) {
    probe.font = fontOf(l);
    const size = (l.size ?? base) * SS, max = w * SS - pad * 2;
    let cur = '';
    const push = (s: string) => { rows.push({ text: s, l, y: y + size }); y += size * 1.42; };
    for (const word of l.t.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (probe.measureText(next).width > max && cur) { push(cur); cur = word; } else cur = next;
    }
    push(cur);
    y += (l.gap ?? 0) * SS;
  }
  const c = document.createElement('canvas');
  c.width = w * SS; c.height = Math.ceil(y + pad * 0.7);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = o.bg ?? C.term; ctx.fillRect(0, 0, c.width, c.height);
  for (const r of rows) { ctx.font = fontOf(r.l); ctx.fillStyle = r.l.color ?? C.termText; ctx.textBaseline = 'alphabetic'; ctx.fillText(r.text, pad, r.y); }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = LinearMipmapLinearFilter; tex.anisotropy = 8;
  // Canvas pictures are the right way up for a card when their rows are flipped as footage is.
  tex.flipY = false;
  const h = c.height / SS;
  const card = new Card({ w, h, radius: o.radius ?? 18, rim: o.rim ?? 2.5, rimColor: o.rimColor ?? '#3f7f7a', shadow: 0.7, color: o.bg ?? C.term, ...(o.glow ? { glow: o.glow } : {}) });
  card.show(tex, [0, 1, 1, 0]);
  return card;
}

/** The Ludora mark: the gold tile with its L, leaning forward, drawn the way the app draws it. */
export function logoTile(size: number) {
  const s = 8;
  const c = document.createElement('canvas');
  c.width = c.height = 64 * s;
  const ctx = c.getContext('2d')!;
  ctx.scale(s, s);
  ctx.translate(32, 32); ctx.transform(1, 0, Math.tan((-10 * Math.PI) / 180), 1, 0, 0); ctx.translate(-32, -32);
  const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  ctx.fillStyle = '#E9A400'; rr(9, 5, 46, 54, 9);
  ctx.fillStyle = '#FFC233'; rr(9, 5, 46, 49, 9);
  ctx.fillStyle = '#0B1020';
  ctx.beginPath(); ctx.moveTo(22, 14); ctx.lineTo(31.5, 14); ctx.lineTo(31.5, 38.5); ctx.lineTo(44, 38.5); ctx.lineTo(44, 47); ctx.lineTo(22, 47); ctx.closePath(); ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 21;
  return m;
}

/** The seven uniforms of The Hills Grammar School as the game dresses them, with the years that wear each. */
export const UNIFORMS = [
  { id: 'kinder', years: 'Kindergarten\nto Year 2' },
  { id: 'junior-green', years: 'Years 3 to 6' },
  { id: 'junior-grey', years: 'Years 3 to 6\ngrey blazer' },
  { id: 'senior-green', years: 'Years 7 to 12' },
  { id: 'senior-grey', years: 'Years 7 to 12\ngrey blazer' },
  { id: 'sport-junior', years: 'Sport\nto Year 6' },
  { id: 'sport', years: 'Sport\nYears 7 to 12' },
] as const;
export type Uniform = (typeof UNIFORMS)[number]['id'];
/** The school's own colours for paper and light. */
export const PAPER = ['#f6ecd2', '#00a766', '#5fdcaa', '#f04b65', '#ffffff', '#ffc233', '#0b6b4b'];
