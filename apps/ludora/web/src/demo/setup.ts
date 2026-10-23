import { SETS } from '@ludora/content/sets';
import { CATALOG, type CatalogMode } from '@ludora/engine/catalog';
import { displayNameSchema, generateName } from '@ludora/shared';
import type { ModeVariant } from '@ludora/engine';
import type { CatalogEntry } from '../lib/queries.ts';
import type { DemoSetup } from './localRoom.ts';

/*
 * What the demo offers and what it remembers. The built-in question sets and
 * the mode catalogue ship inside the page; a game's choices travel in the
 * address (so a game survives a reload and can be shared), and the name and
 * sound switches stay in this browser.
 */

export { SETS };

/** A variant whose rules make the room wait for a host to press Next: nobody is at the front in the demo. */
function waitsForHost(mode: CatalogMode, v: ModeVariant): boolean {
  return mode.meta.pacing === 'host' && mode.settings.some((f) => f.key === 'autoAdvance') && Boolean(v.locked?.includes('autoAdvance')) && v.settings?.autoAdvance === false;
}

/** Every playable mode, with the variants a room with no host can run, shaped as the host page's mode list. */
export const DEMO_MODES: CatalogEntry[] = CATALOG.filter((m) => m.meta.status !== 'planned').map((m) => ({
  meta: m.meta,
  settings: [...m.settings],
  variants: m.variants
    .filter((v) => v.meta.status !== 'planned' && !waitsForHost(m, v))
    .map((v) => ({ meta: v.meta, ...(v.settings ? { settings: v.settings } : {}), ...(v.common ? { common: v.common } : {}), ...(v.locked ? { locked: [...v.locked] } : {}) })),
  featured: false,
  hidden: false,
}));

export interface DemoChoice {
  setKey: string;
  modeId: string;
  variantId: string | null;
  bots: number;
}

export const DEFAULT_CHOICE: DemoChoice = { setKey: 'official-general-knowledge', modeId: 'classic', variantId: null, bots: 5 };

/** Practice bots a mode can take beside you. One-player modes take none; modes for several players need at least one. */
export function botRange(mode: CatalogEntry): { min: number; max: number } {
  const max = Math.min(19, mode.meta.players.max - 1);
  return { min: Math.min(max, Math.max(0, mode.meta.players.min - 1, mode.meta.teams === 'required' ? 1 : 0)), max };
}

/** A choice with every part checked against what the demo has, falling back to the defaults. */
export function resolveChoice(c: Partial<DemoChoice>) {
  const set = SETS.find((s) => s.seedKey === c.setKey) ?? SETS.find((s) => s.seedKey === DEFAULT_CHOICE.setKey) ?? SETS[0]!;
  const mode = DEMO_MODES.find((m) => m.meta.id === c.modeId) ?? DEMO_MODES.find((m) => m.meta.id === DEFAULT_CHOICE.modeId)!;
  const variant = mode.variants.find((v) => v.meta.id === c.variantId) ?? null;
  const range = botRange(mode);
  const asked = typeof c.bots === 'number' && Number.isFinite(c.bots) ? Math.round(c.bots) : DEFAULT_CHOICE.bots;
  const bots = Math.min(range.max, Math.max(range.min, asked));
  return { set, mode, variant, bots, range, choice: { setKey: set.seedKey, modeId: mode.meta.id, variantId: variant?.meta.id ?? null, bots } satisfies DemoChoice };
}

export function choiceToParams(c: DemoChoice): string {
  const p = new URLSearchParams({ set: c.setKey, mode: c.modeId });
  if (c.variantId) p.set('variant', c.variantId);
  p.set('bots', String(c.bots));
  return p.toString();
}

export function choiceFromParams(p: URLSearchParams): Partial<DemoChoice> {
  const bots = p.get('bots');
  return { setKey: p.get('set') ?? undefined, modeId: p.get('mode') ?? undefined, variantId: p.get('variant'), bots: bots === null ? undefined : Number(bots) };
}

export function toSetup(c: DemoChoice, name: string): DemoSetup {
  const { set, mode, variant, bots } = resolveChoice(c);
  return { set: { title: set.title, questions: set.questions }, modeId: mode.meta.id, variantId: variant?.meta.id ?? null, bots, name };
}

/* ------------------------------ kept in this browser ------------------------------ */

const NAME_KEY = 'ludora.demo.name';
const CHOICE_KEY = 'ludora.demo.choice';
const SOUND_KEY = 'ludora.demo.sound';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing or storage turned off: the choice holds for this visit.
  }
}

/** The name you played under last time, or a friendly generated one. */
export function readName(): string {
  const saved = read(NAME_KEY);
  return saved && displayNameSchema.safeParse(saved).success ? saved : generateName();
}

export const saveName = (name: string) => write(NAME_KEY, name);

export function readChoice(): DemoChoice {
  try {
    return resolveChoice(JSON.parse(read(CHOICE_KEY) ?? '{}') as Partial<DemoChoice>).choice;
  } catch {
    return DEFAULT_CHOICE;
  }
}

export const saveChoice = (c: DemoChoice) => write(CHOICE_KEY, JSON.stringify(c));

export interface SoundPrefs {
  effects: boolean;
  music: boolean;
}

export function readSound(): SoundPrefs {
  try {
    const s = JSON.parse(read(SOUND_KEY) ?? '{}') as Partial<SoundPrefs>;
    return { effects: s.effects !== false, music: s.music !== false };
  } catch {
    return { effects: true, music: true };
  }
}

export const saveSound = (s: SoundPrefs) => write(SOUND_KEY, JSON.stringify(s));
