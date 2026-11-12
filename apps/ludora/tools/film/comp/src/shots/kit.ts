// Small things every scene uses.
import { Group, type Texture } from 'three';
import { Card, Clip, alignWords, ease, riseIn, seg, slab, text, words, type TextMesh, type TextOptions } from '../engine.ts';

/** Plays a clip on a card: frame 1 of the clip at `at` seconds, `speed` times real time, from clip frame `from`. */
export function roll(clip: Clip, card: Card, t: number, { from = 1, speed = 1, crop, hold = false }: { from?: number; speed?: number; crop?: [number, number, number, number]; hold?: boolean } = {}): Promise<unknown> {
  const f = from + Math.max(0, t) * 30 * speed;
  return clip.frame(hold ? Math.min(f, clip.frames) : f).then((tex: Texture | null) => card.show(tex, crop));
}

/** The nudge a cut gives the camera: 1 at the cut, gone in a quarter of a second. */
export const punch = (t: number, rate = 9) => (t < 0 ? 0 : Math.exp(-t * rate));

export interface Caption { group: Group; items: TextMesh[]; width: number; show(t: number, out?: number): void }

/** A caption for the camera-fixed layer. `align` puts its left or right edge at x. */
export function caption(str: string, x: number, y: number, o: Partial<TextOptions> & { align?: 'left' | 'right' | 'center' } = {}): Caption {
  const line = words(str, { size: 96, italic: true, color: '#ffffff', shadow: true, ...o });
  if (o.align === 'left' || o.align === 'right') alignWords(line, o.align);
  line.group.position.set(x, y, 0);
  return { ...line, show(t, out = Infinity) { riseIn(line.items, t, { out }); line.group.visible = t > -0.01; } };
}

/** A name tag for a game: a dark pill with the name and a small gold chip. */
export function nameTag(name: string, chip: string | null = '3D') {
  const g = new Group();
  const label = text(name, { size: 92, italic: true, color: '#ffffff' });
  const padX = 44;
  let w = label.w + padX * 2;
  let chipMesh: TextMesh | null = null;
  let chipBack: Card | null = null;
  if (chip) {
    chipMesh = text(chip, { size: 46, weight: 800, color: '#0b1020' });
    chipBack = slab(chipMesh.w + 36, 62, '#ffc233', 14, 0.15);
    w += chipMesh.w + 36 + 26;
  }
  const back = new Card({ w, h: 124, radius: 30, color: '#070a1f', shadow: 0.5, rim: 2, rimColor: '#5d6be0' });
  back.u.uOpacity!.value = 0.9;
  back.position.x = w / 2;
  label.position.set(padX + label.w / 2, -4, 2);
  g.add(back, label);
  if (chipMesh && chipBack) {
    const cx = padX + label.w + 26 + (chipMesh.w + 36) / 2;
    chipBack.position.set(cx, 0, 2);
    chipMesh.position.set(cx, -2, 3);
    chipMesh.renderOrder = 22;
    g.add(chipBack, chipMesh);
  }
  g.userData.w = w;
  return g;
}

/** Slides something in from the side with a soft landing; returns 0 (away) to 1 (in place). */
export const arrive = (t: number, at = 0, dur = 0.5) => ease.outCubic(seg(t, at, at + dur));
