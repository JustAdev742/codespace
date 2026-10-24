import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in survival-run. Every cheat here has modes: ['survival-run'] and an id starting with 'survival-run.'. */

const MODE = 'survival-run';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
