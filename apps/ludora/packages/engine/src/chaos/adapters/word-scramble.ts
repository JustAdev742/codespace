import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const wordScrambleAdapter: ChaosAdapter = {
  modeId: 'word-scramble',
  meters: [fieldMeter('score', 'Points', (s: any) => s.players, 'points')],
  ...streamParts((s: any, id) => (s.players[id]?.word ? s.players[id].stream : null)),
  // What the game's settings switch on, for the word-scramble pack.
  features: (st) => {
    const f: string[] = [];
    if (st.hints) f.push('hints');
    if (st.wordTimer) f.push('word-timer');
    if (st.streak) f.push('spelling-streak');
    if (st.oneTry) f.push('one-try');
    // A wrong spelling only leaves the word open for another try without one try per word.
    else f.push('retries');
    if (st.secondChance) f.push('second-chances');
    return f;
  },
};
