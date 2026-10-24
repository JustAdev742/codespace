import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in glim-duels. Every cheat here has modes: ['glim-duels'] and an id starting with 'glim-duels.'. */

const MODE = 'glim-duels';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
