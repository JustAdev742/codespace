import { expect, test } from 'vitest';
import { safeNext } from './next.ts';

test('after signing in, only a path on this site is followed', () => {
  expect(safeNext('/classes/abc?tab=students')).toBe('/classes/abc?tab=students');
  expect(safeNext(null)).toBe('/');
  expect(safeNext('')).toBe('/');
  expect(safeNext('https://evil.example')).toBe('/');
  expect(safeNext('//evil.example')).toBe('/');
  expect(safeNext('/\\evil.example')).toBe('/');
});
