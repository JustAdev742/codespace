import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withSchoolTheme } from '../src/school-theme.ts';

const page = readFileSync(resolve(import.meta.dirname, '../../web/index.html'), 'utf8');

describe('the page a school copy serves', () => {
  it('is unchanged on Ludora’s own copy', () => {
    expect(withSchoolTheme(page, undefined)).toBe(page);
  });

  it('marks the school, colours the browser bar in its green and links its own web manifest', () => {
    const html = withSchoolTheme(page, 'hills-grammar');
    expect(html).toContain('<html lang="en-GB" data-school="hills-grammar">');
    const colours = [...html.matchAll(/<meta name="theme-color" content="([^"]+)"/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(0);
    expect(new Set(colours)).toEqual(new Set(['#083A2B']));
    expect(html).toContain('<link rel="manifest" href="/schools/hills-grammar/manifest.webmanifest"');
    expect(html).not.toContain('href="/manifest.webmanifest"');
  });

  it('points at a manifest that exists, in the school’s colours, keeping Ludora’s icons', () => {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../web/public/schools/hills-grammar/manifest.webmanifest'), 'utf8'));
    expect(manifest.theme_color).toBe('#083A2B');
    expect(manifest.short_name).toBe('Ludora');
    for (const icon of manifest.icons) expect(readFileSync(resolve(import.meta.dirname, '../../web/public', icon.src.slice(1))).length).toBeGreaterThan(0);
  });
});
