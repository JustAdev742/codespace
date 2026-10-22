import { describe, expect, it } from 'vitest';
import { eventsAt, stepSeconds, TRACKS, type PartNote } from './music.ts';

/** D major: every chord in both tracks belongs to it, so tunes may use any of its notes. */
const D_MAJOR = new Set([2, 4, 6, 7, 9, 11, 1]);
const inKey = (midi: number) => D_MAJOR.has(midi % 12);

describe.each(Object.values(TRACKS))('the $id track', (track) => {
  const loop = track.bars * 16;

  it('has a chord for every bar and a sensible tempo', () => {
    expect(track.chords).toHaveLength(track.bars);
    expect(track.bpm).toBeGreaterThanOrEqual(80);
    expect(track.bpm).toBeLessThanOrEqual(130);
    for (const c of track.chords) expect(c.notes.every(inKey) && inKey(c.bass)).toBe(true);
  });

  it.each(['melody', 'bells'] as const)('keeps every %s note in key and inside the loop', (part) => {
    for (const n of track[part]) {
      expect(inKey(n.midi), `${part} note ${n.midi} at step ${n.step}`).toBe(true);
      expect(n.len).toBeGreaterThan(0);
      expect(n.step).toBeGreaterThanOrEqual(0);
      expect(n.step + n.len, `${part} note at step ${n.step} runs past the loop`).toBeLessThanOrEqual(loop);
    }
  });

  it('plays its tune one note at a time', () => {
    const notes: PartNote[] = [...track.melody].sort((a, b) => a.step - b.step);
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.step, `melody overlaps at step ${notes[i]!.step}`).toBeGreaterThanOrEqual(notes[i - 1]!.step + notes[i - 1]!.len);
  });

  it('loops seamlessly: step n and step n + one loop play the same', () => {
    for (let n = 0; n < loop; n++) expect(eventsAt(track, n + loop)).toEqual(eventsAt(track, n));
    expect(eventsAt(track, -1)).toEqual(eventsAt(track, loop - 1));
  });

  it('starts every bar on its chord, with the pad and the bass', () => {
    for (let bar = 0; bar < track.bars; bar++) {
      const kinds = eventsAt(track, bar * 16).map((e) => e.kind);
      expect(kinds).toContain('pad');
      expect(kinds).toContain('bass');
      const padEvent = eventsAt(track, bar * 16).find((e) => e.kind === 'pad');
      expect(padEvent && 'notes' in padEvent ? padEvent.notes : null).toEqual(track.chords[bar]!.notes);
    }
  });

  it('plucks only the bar’s chord tones in its arpeggio', () => {
    for (let n = 0; n < loop; n++) {
      const chord = track.chords[Math.floor(n / 16)]!;
      for (const e of eventsAt(track, n)) if (e.kind === 'arp') expect(chord.notes.map((x) => x + 12)).toContain(e.midi);
    }
  });

  it('lasts long enough not to repeat too soon', () => {
    expect(loop * stepSeconds(track)).toBeGreaterThanOrEqual(15);
  });
});
