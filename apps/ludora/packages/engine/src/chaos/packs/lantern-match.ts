import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in lantern-match. Every cheat here has modes: ['lantern-match'] and an id starting with 'lantern-match.'. */

const MODE = 'lantern-match';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
