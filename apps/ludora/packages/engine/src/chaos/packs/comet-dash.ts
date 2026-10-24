import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in comet-dash. Every cheat here has modes: ['comet-dash'] and an id starting with 'comet-dash.'. */

const MODE = 'comet-dash';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
