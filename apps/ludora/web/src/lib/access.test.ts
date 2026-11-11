import { describe, expect, it } from 'vitest';
import type { PublicQuestion } from '@ludora/shared';
import { ACCESS_DEFAULTS, lookAttributes } from './prefs.ts';
import { spokenQuestion } from './speech.ts';
import { instantFromWallClock, zonedParts, zoneOffsetMinutes } from './format.ts';
import { unseen } from '../features/whatsnew/WhatsNew.tsx';
import { keyToChoice } from '../features/room/game/AnswerInput.tsx';
import { matches, SETTINGS } from '../features/settings/AccessSettings.tsx';

const base = { theme: 'system' as const, reducedMotion: 'system' as const, textSize: 'normal' as const, highContrast: false };

describe('look attributes', () => {
  it('sets nothing for the defaults, so the page looks as it always did', () => {
    expect(lookAttributes({ ...base, access: ACCESS_DEFAULTS })).toEqual({});
    expect(lookAttributes(base)).toEqual({});
  });
  it('turns each chosen setting into its attribute', () => {
    expect(
      lookAttributes({ ...base, textSize: 'larger', highContrast: true, access: { font: 'easy', letterSpacing: 'wider', lineSpacing: 'wide', tiles: 'safe', calm: true, littleHands: true, timer: 'hidden', lessTransparency: true, underlineLinks: true, strongFocus: true, dataSaver: 'on' } }),
    ).toEqual({ text: 'larger', contrast: 'high', font: 'easy', letters: 'wider', lines: 'wide', tiles: 'safe', calm: 'on', little: 'on', timer: 'hidden', transparency: 'less', links: 'underline', focus: 'strong', saver: 'on' });
    expect(lookAttributes({ ...base, access: { maxContrast: true } }).contrast).toBe('max');
  });
});

describe('read aloud', () => {
  it('reads the number, the prompt and each answer with its letter, maths in words', () => {
    const q: PublicQuestion = { type: 'mcq', prompt: 'What is $3/4$ of 8', choices: [{ id: 'c0', text: '6' }, { id: 'c1', text: '4' }] };
    expect(spokenQuestion(q, 1, 10)).toBe('Question 2 of 10. What is 3 over 4 of 8. A: 6. B: 4.');
  });
  it('says what to do for each kind of question', () => {
    expect(spokenQuestion({ type: 'truefalse', prompt: 'Bats are mammals.' })).toBe('Bats are mammals. True or false?');
    expect(spokenQuestion({ type: 'blanks', prompt: 'Fill the gap.', pieces: ['The cat sat on the ', '.'], bank: ['mat', 'hat'] })).toBe('Fill the gap. The cat sat on the blank. Words to use: mat, hat.');
    expect(spokenQuestion({ type: 'sort', prompt: 'Sort them.', items: [{ id: 'i0', text: 'Cat' }, { id: 'i1', text: 'Oak' }], groups: [{ id: 'g0', label: 'Animals' }, { id: 'g1', label: 'Plants' }] })).toBe('Sort them. Sort Cat, Oak, into Animals, Plants.');
  });
});

describe('answer keys', () => {
  it('maps 1 to 6, and A to F when letters are on', () => {
    expect(keyToChoice('1', 4, false)).toBe(0);
    expect(keyToChoice('4', 4, true)).toBe(3);
    expect(keyToChoice('5', 4, true)).toBeNull();
    expect(keyToChoice('b', 4, true)).toBe(1);
    expect(keyToChoice('D', 4, true)).toBe(3);
    expect(keyToChoice('e', 4, true)).toBeNull();
    // Beside a game board the letters walk, so they pick nothing.
    expect(keyToChoice('a', 4, false)).toBeNull();
  });
});

describe('time zones', () => {
  it('reads a wall-clock time in a chosen zone, across summer time', () => {
    expect(instantFromWallClock('2026-07-01T15:00', 'Europe/London')!.toISOString()).toBe('2026-07-01T14:00:00.000Z');
    expect(instantFromWallClock('2026-12-01T15:00', 'Europe/London')!.toISOString()).toBe('2026-12-01T15:00:00.000Z');
    expect(instantFromWallClock('2026-12-01T09:30', 'America/New_York')!.toISOString()).toBe('2026-12-01T14:30:00.000Z');
    expect(instantFromWallClock('not a date', 'UTC')).toBeNull();
  });
  it('gives the parts and offset of an instant in a zone', () => {
    const d = new Date('2026-07-01T14:00:00Z');
    expect(zonedParts(d, 'Australia/Sydney')).toEqual({ y: 2026, mo: 7, d: 2, h: 0, mi: 0 });
    expect(zoneOffsetMinutes(d, 'Europe/London')).toBe(60);
    expect(zoneOffsetMinutes(d, 'Asia/Kolkata')).toBe(330);
  });
});

describe("what's new", () => {
  const entries = [
    { id: 'c', date: '2026-11-03', title: 'C', items: [] },
    { id: 'b', date: '2026-11-02', title: 'B', items: [] },
    { id: 'a', date: '2026-11-01', title: 'A', items: [] },
  ];
  it('shows only entries newer than the last one seen', () => {
    expect(unseen(entries, null)).toHaveLength(3);
    expect(unseen(entries, 'b').map((e) => e.id)).toEqual(['c']);
    expect(unseen(entries, 'c')).toEqual([]);
    expect(unseen(entries, 'gone')).toHaveLength(3);
  });
});

describe('settings search', () => {
  const find = (q: string) => SETTINGS.filter((d) => matches(d, q)).map((d) => d.id);
  it('finds settings by their words and by what people might call them', () => {
    expect(find('timer')).toContain('timer');
    expect(find('colour blind')).toEqual(['tiles']);
    expect(find('dyslexia')).toEqual(expect.arrayContaining(['font', 'letterSpacing', 'readAloud']));
    expect(find('')).toHaveLength(SETTINGS.length);
    expect(find('zzzz')).toEqual([]);
  });
});
