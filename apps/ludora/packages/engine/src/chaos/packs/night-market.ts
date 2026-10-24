import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in night-market. Every cheat here has modes: ['night-market'] and an id starting with 'night-market.'. */

const MODE = 'night-market';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
