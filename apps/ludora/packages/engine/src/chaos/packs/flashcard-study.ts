import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in flashcard-study. Every cheat here has modes: ['flashcard-study'] and an id starting with 'flashcard-study.'. */

const MODE = 'flashcard-study';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
