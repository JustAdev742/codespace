import { describe, expect, it } from 'vitest';
import { READ_MS_PER_WORD, WRONG_MAX_MS, feedbackMs } from './answerFlow.tsx';

const PACE = { right: 1100, wrong: 2400 };

describe('how long a result stays up between answers', () => {
  it('gives a right answer a glance, whatever there is to read', () => {
    expect(feedbackMs(true, PACE)).toBe(1100);
    expect(feedbackMs(true, PACE, 'Iron oxide, which is rust, covers the surface of Mars and makes it look red.')).toBe(1100);
  });

  it('keeps a wrong answer with nothing to read at the mode\'s own pace', () => {
    expect(feedbackMs(false, PACE)).toBe(2400);
    expect(feedbackMs(false, PACE, null)).toBe(2400);
    expect(feedbackMs(false, PACE, '   ')).toBe(2400);
  });

  it('adds reading time for the explanation, a word at a time', () => {
    expect(feedbackMs(false, PACE, 'Spiders have eight legs.')).toBe(2400 + 4 * READ_MS_PER_WORD);
    // Fifteen words: a young reader needs most of seven seconds.
    const mars = 'Iron oxide, which is rust, covers the surface of Mars and makes it look red.';
    expect(mars.split(' ')).toHaveLength(15);
    expect(feedbackMs(false, PACE, mars)).toBe(WRONG_MAX_MS);
    expect(feedbackMs(false, PACE, 'Plants take in carbon dioxide and give out oxygen.')).toBe(2400 + 9 * READ_MS_PER_WORD);
  });

  it('never holds the next question back for longer than the cap, however long the explanation', () => {
    expect(feedbackMs(false, PACE, Array.from({ length: 80 }, () => 'word').join(' '))).toBe(WRONG_MAX_MS);
    // Unless the mode's own pace is slower than the cap already.
    expect(feedbackMs(false, { right: 1000, wrong: 9000 }, 'A few words.')).toBe(9000);
  });
});
