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


/** A set's cover tile: a coloured square with its glyph. */
export function SetCover({ cover, subject, size = 56 }: { cover: { glyph: string; hue: number } | null; subject: string; size?: number }) {
  const c = cover ?? SUBJECT_COVER_DEFAULTS[subject as Subject] ?? SUBJECT_COVER_DEFAULTS.general;
  const Icon = GLYPHS[c.glyph] ?? Star;
  return (
    <span className="grid shrink-0 place-items-center rounded-[14px] border-2 border-ink text-white" style={{ width: size, height: size, background: `hsl(${c.hue} 65% 52%)`, boxShadow: `inset 0 -${Math.round(size / 10)}px 0 hsl(${c.hue} 60% 40%)` }} aria-hidden>
      <Icon className="size-[45%]" />
    </span>
  );
}
