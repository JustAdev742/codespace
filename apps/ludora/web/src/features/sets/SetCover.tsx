import { Atom, BookOpen, Calculator, Cpu, FlaskConical, Globe2, Heart, Landmark, Languages, Leaf, Music, Palette, Puzzle, Star } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Subject } from '@ludora/shared';
import { SUBJECT_COVER_DEFAULTS } from './covers.ts';

const GLYPHS: Record<string, ComponentType<{ className?: string }>> = {
  atom: Atom,
  globe: Globe2,
  book: BookOpen,
  calculator: Calculator,
  palette: Palette,
  music: Music,
  leaf: Leaf,
  flask: FlaskConical,
  landmark: Landmark,
  languages: Languages,
  cpu: Cpu,
  heart: Heart,
  star: Star,
  puzzle: Puzzle,
};

/** Relative luminance of hsl(h 65% 52%), the cover's fill. */
function fillLuminance(hue: number): number {
  const s = 0.65;
  const l = 0.52;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

/**
 * A set's cover tile: a solid square in its colour with its glyph, like an icon
 * in a game catalogue. No outline. The glyph is ink on the lighter colours and
 * white on the darker ones, whichever reads better.
 */
export function SetCover({ cover, subject, size = 56 }: { cover: { glyph: string; hue: number } | null; subject: string; size?: number }) {
  const c = cover ?? SUBJECT_COVER_DEFAULTS[subject as Subject] ?? SUBJECT_COVER_DEFAULTS.general;
  const Icon = GLYPHS[c.glyph] ?? Star;
  // Ink (luminance about 0.005) against white: pick the one with more contrast on this fill.
  const lum = fillLuminance(c.hue);
  const glyph = (lum + 0.05) / 0.055 >= 1.05 / (lum + 0.05) ? 'var(--on-accent)' : '#ffffff';
  const radius = size >= 64 ? 'var(--radius-l)' : size >= 36 ? 'var(--radius-m)' : 'var(--radius-s)';
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: radius, background: `hsl(${c.hue} 65% 52%)`, color: glyph }} aria-hidden>
      <Icon className="size-[46%]" />
    </span>
  );
}
