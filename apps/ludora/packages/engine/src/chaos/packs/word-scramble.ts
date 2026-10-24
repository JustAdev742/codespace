import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in word-scramble. Every cheat here has modes: ['word-scramble'] and an id starting with 'word-scramble.'. */

const MODE = 'word-scramble';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
