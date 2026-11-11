import { useQueryClient } from '@tanstack/react-query';
import type { CatalogEntry } from '../../../lib/queries.ts';

/**
 * A mode's colour (its catalogue hue) as a solid fill that ink text reads on, for "Get ready" and the
 * question sting. Read from the catalogue the room page has already loaded and never fetched from here
 * (the playable demo has no server); gold until it is there.
 */
export function useModeFill(modeId: string): string {
  const modes = useQueryClient().getQueryData<{ modes: CatalogEntry[] }>(['modes']);
  const hue = modes?.modes.find((m) => m.meta.id === modeId)?.meta.thumbnail.hue ?? 42;
  return `hsl(${hue} 88% ${fillLightness(hue)}%)`;
}

/** The darkest lightness (from 58%) at which ink text keeps 4.6:1 on this hue: bright hues stay rich, blues get lighter. */
export function fillLightness(hue: number): number {
  const lum = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const ink = 0.2126 * lum(11 / 255) + 0.7152 * lum(16 / 255) + 0.0722 * lum(32 / 255);
  for (let l = 58; l < 80; l += 2) {
    const k = (n: number) => (n + hue / 30) % 12;
    const a = 0.88 * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => l / 100 - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    const y = 0.2126 * lum(f(0)) + 0.7152 * lum(f(8)) + 0.0722 * lum(f(4));
    if ((y + 0.05) / (ink + 0.05) >= 4.6) return l;
  }
  return 80;
}
