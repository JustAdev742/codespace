import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDay, formatDecimal } from './format.ts';

/*
 * A lint rule as a test: dates, times and numbers are written through `lib/format.ts`, so they
 * follow the player's chosen time zone and date style (Settings). A direct `toLocaleDateString`,
 * `toLocaleTimeString` or `toLocaleString` call bypasses both, so a new one fails here with the
 * file and line to change.
 */

const root = join(import.meta.dirname, '..');
const allowed = new Set(['lib/format.ts', 'lib/format-usage.test.ts']);
const banned = /\.toLocale(?:Date|Time)?String\(/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('dates and numbers go through lib/format.ts', () => {
  it('no source file calls toLocaleDateString, toLocaleTimeString or toLocaleString itself', () => {
    const found: string[] = [];
    for (const file of sources(root)) {
      const rel = relative(root, file).split('\\').join('/');
      if (allowed.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (banned.test(line)) found.push(`web/src/${rel}:${i + 1}: use formatDate, formatDay, formatNumber or formatDecimal from lib/format.ts`);
        });
    }
    expect(found).toEqual([]);
  });

  it('a calendar day stays the same day whatever the zone', () => {
    expect(formatDay('2026-11-11', { day: 'numeric', month: 'long', year: 'numeric' })).toBe('11 November 2026');
    expect(formatDay(new Date('2026-03-01T00:00:00Z'), { day: 'numeric', month: 'short' })).toBe('1 Mar');
  });

  it('decimals keep the digits asked for', () => {
    expect(formatDecimal(2.345, 1)).toBe('2.3');
    expect(formatDecimal(1234.5, 1)).toBe('1,234.5');
  });
});
