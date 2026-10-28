import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { AccessoryArt, GlimArt, Rarity } from '@ludora/shared';
import { Glim } from '../art/glim/Glim.tsx';

/*
 * Pictures of a Glim for the 3D builder, drawn by the same SVG code as every
 * 2D Glim so the two always match: the front (body, markings, face and
 * accessories, no arms or feet) and the back (the same without the face).
 * Each is drawn once per look and size and kept.
 */

export interface GlimLook {
  art: GlimArt;
  accessories?: AccessoryArt[] | undefined;
  rarity?: Rarity | undefined;
}

/** Faces for moments in a game. Each swaps the eyes, mouth and brows for a while. */
export const EXPRESSIONS = {
  happy: { eyes: 'happy', mouth: 'grin' },
  surprised: { eyes: 'big', mouth: 'o', brows: 'surprised' },
  determined: { brows: 'determined', mouth: 'smirk' },
  dizzy: { eyes: 'sleepy', mouth: 'wobble', brows: 'worried' },
  proud: { eyes: 'half', mouth: 'smirk', brows: 'smug' },
  sad: { eyes: 'dot', mouth: 'wobble', brows: 'worried' },
} as const satisfies Record<string, Partial<GlimArt>>;
export type Expression = keyof typeof EXPRESSIONS;

export function lookKey(look: GlimLook, extra = ''): string {
  return `${JSON.stringify(look.art)}|${JSON.stringify(look.accessories ?? [])}|${look.rarity ?? 'common'}|${extra}`;
}

const cache = new Map<string, Promise<HTMLCanvasElement>>();

async function draw(look: GlimLook, size: number, faceless: boolean, expression: Expression | null): Promise<HTMLCanvasElement> {
  // Let whatever React is doing finish before drawing into a root of our own.
  await Promise.resolve();
  const art = expression ? { ...look.art, ...EXPRESSIONS[expression] } : look.art;
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => {
    root.render(createElement(Glim, { art: art as GlimArt, accessories: look.accessories, rarity: look.rarity ?? 'common', size, limbs: false, ground: false, faceless, contour: false }));
  });
  const svg = host.querySelector('svg');
  const markup = svg ? new XMLSerializer().serializeToString(svg) : '';
  root.unmount();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  if (!markup) return canvas;
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // The 3D builder reads the pixels straight back (getImageData): a canvas kept in memory does that
    // cheaply, where a GPU canvas stalls to copy them back, for seconds on software renderers.
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, size, size);
  } finally {
    URL.revokeObjectURL(url);
  }
  return canvas;
}

/** The front or back of a Glim as a square canvas. Cached by look. */
export function glimCanvas(look: GlimLook, size: number, opts: { faceless?: boolean; expression?: Expression | null } = {}): Promise<HTMLCanvasElement> {
  const key = lookKey(look, `${size}|${opts.faceless ? 'back' : 'front'}|${opts.expression ?? ''}`);
  let hit = cache.get(key);
  if (!hit) {
    hit = draw(look, size, Boolean(opts.faceless), opts.expression ?? null);
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}
