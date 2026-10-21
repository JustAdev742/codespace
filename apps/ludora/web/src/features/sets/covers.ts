import type { SetCoverGlyph, Subject } from '@ludora/shared';

/** The cover a set shows until its author picks one. Used by the cover tile and the set editor. */
export const SUBJECT_COVER_DEFAULTS: Record<Subject, { glyph: SetCoverGlyph; hue: number }> = {
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
