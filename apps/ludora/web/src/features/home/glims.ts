import type { GlimArt } from '@ludora/shared';

/** Real Glims from the catalogue, so what is shown is what players can find. */
export const GLIMS = {
  sprig: { kind: 'glim', body: 'sprout', hue: 108, accentHue: 84, saturation: 64, eyes: 'happy', mouth: 'smile', pattern: 'belly', topper: 'none', cheeks: true, ears: 'leaf' },
  dewdrop: { kind: 'glim', body: 'drop', hue: 196, accentHue: 175, saturation: 74, eyes: 'sparkle', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true, brows: 'soft' },
  buzzbean: { kind: 'glim', body: 'blob', hue: 50, accentHue: 30, saturation: 92, eyes: 'big', mouth: 'grin', pattern: 'bands', topper: 'none', cheeks: true, ears: 'feelers', back: 'fairy' },
  briarcat: { kind: 'glim', body: 'cat', hue: 88, accentHue: 342, saturation: 58, eyes: 'big', mouth: 'fang', pattern: 'freckles', topper: 'rose', cheeks: false, brows: 'worried', tail: 'curl' },
  lamplighter: { kind: 'glim', body: 'lantern', hue: 32, accentHue: 270, saturation: 84, eyes: 'star', mouth: 'o', pattern: 'belly', topper: 'flame', cheeks: true, brows: 'soft', tail: 'tassel' },
  hearthkeeper: { kind: 'glim', body: 'blob', hue: 20, accentHue: 52, saturation: 96, eyes: 'half', mouth: 'cat', pattern: 'stars', topper: 'flame', cheeks: true, brows: 'bushy', ears: 'fox', tail: 'fox', face: 'whiskers' },
  novabelle: { kind: 'glim', body: 'moth', hue: 300, accentHue: 46, saturation: 100, eyes: 'sparkle', mouth: 'o', pattern: 'stars', topper: 'halo', cheeks: true, brows: 'surprised', back: 'burst' },
  constella: { kind: 'glim', body: 'star', hue: 250, accentHue: 46, saturation: 88, eyes: 'star', mouth: 'grin', pattern: 'constellation', topper: 'star', cheeks: true, brows: 'soft' },
  quillington: { kind: 'glim', body: 'owl', hue: 354, accentHue: 46, saturation: 52, eyes: 'big', mouth: 'o', pattern: 'patch', topper: 'quill', cheeks: true, brows: 'surprised' },
  anglet: { kind: 'glim', body: 'blob', hue: 220, accentHue: 54, saturation: 62, eyes: 'big', mouth: 'toothy', pattern: 'spots', topper: 'lure', cheeks: false, brows: 'soft', ears: 'fin' },
  dappledew: { kind: 'glim', body: 'mushroom', hue: 92, accentHue: 284, saturation: 44, eyes: 'sparkle', mouth: 'smile', pattern: 'stars', topper: 'antenna', cheeks: true },
  pebblet: { kind: 'glim', body: 'blob', hue: 30, accentHue: 110, saturation: 22, eyes: 'dot', mouth: 'smile', pattern: 'freckles', topper: 'sprout', cheeks: true, brows: 'soft' },
  moonchill: { kind: 'glim', body: 'ghost', hue: 220, accentHue: 268, saturation: 32, eyes: 'sparkle', mouth: 'none', pattern: 'stars', topper: 'halo', cheeks: false, ears: 'crystal' },
} satisfies Record<string, GlimArt>;
