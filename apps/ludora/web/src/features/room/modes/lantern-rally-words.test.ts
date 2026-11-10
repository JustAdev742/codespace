import { describe, expect, it } from 'vitest';
import { aheadWords, eventLine, ghostGap, raceWords, timeText, type WordsInput } from './lantern-rally-words.ts';

const base: WordsInput = {
  kind: 'race',
  circuit: 'harbour',
  length: 500,
  laps: 3,
  race: 1,
  races: 1,
  now: 10_000,
  startAt: 4000,
  phase: 'race',
  racers: 4,
  you: { d: 100, lane: 1, place: 2, lap: 1, finished: null, finishMs: null, bestLap: null, lapStart: 4000, shield: false, boosting: false, ghost: null, got: [] },
  karts: [
    { name: 'You', d: 100, lane: 1, me: true, finished: null },
    { name: 'Mia', d: 112, lane: 1, me: false, finished: null },
    { name: 'Sam', d: 95, lane: 0, me: false, finished: null },
    { name: 'Far', d: 400, lane: 2, me: false, finished: null },
  ],
  items: [
    [120, 1, 0],
    [130, 0, 2],
    [300, 2, 1],
  ],
};

describe('Lantern Rally in words', () => {
  it('formats race times', () => {
    expect(timeText(41_234)).toBe('41.2 s');
    expect(timeText(62_300)).toBe('1:02.3');
  });

  it('says your place, lap and lane, who is close, and what lies ahead in each lane', () => {
    expect(raceWords(base)).toBe('You are 2nd of 4, lap 1 of 3, in the middle lane. Mia is 12 metres ahead in your lane. Sam is 5 metres behind. Ahead: a puddle in your lane in 20 metres; a lantern in the left lane in 30 metres.');
  });

  it('skips lanterns you already have, and wraps round the lap', () => {
    expect(aheadWords(100, 1, 500, base.items, [1])).toBe('Ahead: a puddle in your lane in 20 metres.');
    expect(aheadWords(490, 2, 500, [[10, 2, 1]], [])).toBe('Ahead: cones in your lane in 20 metres.');
    expect(aheadWords(200, 1, 500, base.items, [])).toBe('The road ahead is clear.');
  });

  it('counts down on the grid, and says how you finished', () => {
    expect(raceWords({ ...base, now: 1500 })).toBe('On the grid at Harbour Lights, 3 laps. The lights go out in 3 seconds. You start 2nd of 4, in the middle lane.');
    expect(raceWords({ ...base, you: { ...base.you, finished: 1, finishMs: 95_000 } })).toMatch(/^You finished 1st in 1:35\.0\./);
  });

  it('measures a time trial against the ghost of your best lap', () => {
    // The ghost was at 50 m after 5 seconds; you get there in 6: a second behind.
    const ghost = Array.from({ length: 40 }, (_, i) => i * 50);
    expect(ghostGap(ghost, 0, 6000, 50, 500)).toBeCloseTo(-1, 3);
    expect(ghostGap(ghost, 0, 4000, 50, 500)).toBeCloseTo(1, 3);
    expect(raceWords({ ...base, kind: 'trial', laps: null, now: 6000, you: { ...base.you, d: 50, lapStart: 0, ghost, bestLap: 30_000 } })).toMatch(/^Lap 1, in the middle lane\. Best lap 30\.0 s\. 1\.0 seconds behind your best lap\./);
  });

  it('has a line for everything that happens to your kart', () => {
    const o = { laps: 3, kind: 'race' as const, circuit: 'forest' as const };
    expect(eventLine({ seq: 1, at: 0, kind: 'lantern', prize: 'shield' }, o)).toBe('Lantern! Shield: drive through the next puddle or cone untouched.');
    expect(eventLine({ seq: 2, at: 0, kind: 'lap', lap: 2, ms: 40_100, final: true, best: true }, o)).toBe('Final lap! Lap time 40.1 s, your best yet.');
    expect(eventLine({ seq: 3, at: 0, kind: 'lap', lap: 1, ms: 42_000, best: true }, o)).toBe('Lap 2 of 3. Lap time 42.0 s.');
    expect(eventLine({ seq: 4, at: 0, kind: 'finish', place: 3, ms: 130_000 }, o)).toBe('You finished 3rd in 2:10.0!');
    expect(eventLine({ seq: 5, at: 0, kind: 'up', place: 2 }, o)).toBe('Up to 2nd!');
  });
});
