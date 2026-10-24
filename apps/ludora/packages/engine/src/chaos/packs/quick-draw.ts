import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in quick-draw. Every cheat here has modes: ['quick-draw'] and an id starting with 'quick-draw.'. */

const MODE = 'quick-draw';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
