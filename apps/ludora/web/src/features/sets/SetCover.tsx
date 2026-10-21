import { Atom, BookOpen, Calculator, Cpu, FlaskConical, Globe2, Heart, Landmark, Languages, Leaf, Music, Palette, Puzzle, Star } from 'lucide-react';
import type { ComponentType } from 'react';

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

const SUBJECT_DEFAULTS: Record<string, { glyph: string; hue: number }> = {
  math: { glyph: 'calculator', hue: 215 },
  science: { glyph: 'flask', hue: 160 },
  english: { glyph: 'book', hue: 330 },
  vocabulary: { glyph: 'book', hue: 280 },
  geography: { glyph: 'globe', hue: 190 },
  history: { glyph: 'landmark', hue: 30 },
  languages: { glyph: 'languages', hue: 0 },
  computing: { glyph: 'cpu', hue: 250 },
  arts: { glyph: 'palette', hue: 300 },
  music: { glyph: 'music', hue: 45 },
  health: { glyph: 'heart', hue: 350 },
  general: { glyph: 'star', hue: 42 },
};

/** A set's cover tile: a coloured square with its glyph. */
export function SetCover({ cover, subject, size = 56 }: { cover: { glyph: string; hue: number } | null; subject: string; size?: number }) {
  const c = cover ?? SUBJECT_DEFAULTS[subject] ?? SUBJECT_DEFAULTS.general!;
  const Icon = GLYPHS[c.glyph] ?? Star;
  return (
    <span className="grid shrink-0 place-items-center rounded-[14px] border-2 border-ink text-white" style={{ width: size, height: size, background: `hsl(${c.hue} 65% 52%)`, boxShadow: `inset 0 -${Math.round(size / 10)}px 0 hsl(${c.hue} 60% 40%)` }} aria-hidden>
      <Icon className="size-[45%]" />
    </span>
  );
}
