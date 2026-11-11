import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MODES, VARIANTS } from '@ludora/engine';
import { GLIMS } from '@ludora/content';
import { COVER_LOADERS, loadCover } from './index.ts';
import { VARIANT_MARK, variantMark } from './marks.ts';
import { palette } from './kit.tsx';
import { CAST } from './cast.ts';
import { MODE_GLYPHS, ModeArt } from '../ModeArt.tsx';

const modeIds = MODES.map((m) => m.meta.id);

describe('mode covers', () => {
  it('every mode has a cover, and there is no cover for a mode that does not exist', () => {
    expect(modeIds.filter((id) => !COVER_LOADERS[id])).toEqual([]);
    expect(Object.keys(COVER_LOADERS).filter((id) => !modeIds.includes(id))).toEqual([]);
  });

  it('every cover draws a scene in its own mode colours', async () => {
    for (const m of MODES) {
      const Cover = await loadCover(m.meta.id);
      expect(Cover, m.meta.id).toBeTruthy();
      const svg = renderToStaticMarkup(createElement('svg', { viewBox: '0 0 160 100' }, createElement(Cover!, { p: palette(m.meta.thumbnail.hue, m.meta.thumbnail.accentHue) })));
      // A real scene: the sky, the subject's contour and a good number of shapes, and no text.
      expect(svg, m.meta.id).toContain('linearGradient');
      expect((svg.match(/<path/g) ?? []).length, m.meta.id).toBeGreaterThan(8);
      expect(svg, m.meta.id).not.toContain('<text');
    }
  });

  it('every variant resolves to its parent cover and a mark of what it changes', () => {
    for (const v of VARIANTS) {
      const parent = MODES.find((m) => m.meta.id === v.meta.modeId);
      expect(parent, v.meta.id).toBeTruthy();
      expect(COVER_LOADERS[parent!.meta.id], v.meta.id).toBeTruthy();
      const mark = variantMark(v.meta.id, v.meta.thumbnail?.glyph);
      expect(mark && MODE_GLYPHS.includes(mark), `${v.meta.id}: ${mark}`).toBe(true);
      expect(mark, `${v.meta.id} needs a mark unlike its parent's glyph`).not.toBe(parent!.meta.thumbnail.glyph);
    }
    const variantIds = new Set(VARIANTS.map((v) => v.meta.id));
    expect(Object.keys(VARIANT_MARK).filter((id) => !variantIds.has(id))).toEqual([]);
  });

  it('a variant card shows its mark; a cover beside the name is hidden from screen readers, a lone one is named', () => {
    const mode = MODES[0]!.meta;
    const variant = VARIANTS.find((v) => v.meta.modeId === mode.id)!.meta;
    const beside = renderToStaticMarkup(createElement(ModeArt, { thumb: mode.thumbnail, mode, variant }));
    expect(beside).toContain('aria-hidden="true"');
    expect(beside).toContain('mode-cover-mark');
    const alone = renderToStaticMarkup(createElement(ModeArt, { thumb: mode.thumbnail, mode, label: `${mode.title} artwork` }));
    expect(alone).toContain('role="img"');
    expect(alone).toContain(`aria-label="${mode.title} artwork"`);
    expect(alone).not.toContain('mode-cover-mark');
  });

  it('the Glims on the covers are real Glims from the catalogue', () => {
    for (const [name, art] of Object.entries(CAST)) {
      const match = GLIMS.some((g) => Object.entries(art).every(([k, val]) => (g.art as Record<string, unknown>)[k] === val));
      expect(match, name).toBe(true);
    }
  });
});
