import {
  commonSettingsSchema,
  type CommonSettings,
  type Question,
  type QuestionType,
  type SettingValues,
} from '@ludora/shared';
import { createRng } from '@ludora/shared';
import { MODES, VARIANTS } from './modes/index.ts';
import { adaptQuestions, type AdaptResult } from './questions/adapt.ts';
import { parseSettings } from './sdk/settings.ts';
import type { GameMode, ModeVariant } from './sdk/types.ts';

const modeById = new Map(MODES.map((m) => [m.meta.id, m]));
const variantById = new Map(VARIANTS.map((v) => [v.meta.id, v]));

export function getMode(id: string): GameMode | undefined {
  return modeById.get(id);
}

export function getVariant(id: string): ModeVariant | undefined {
  return variantById.get(id);
}

export function variantsOf(modeId: string): ModeVariant[] {
  return VARIANTS.filter((v) => v.meta.modeId === modeId);
}

export interface GameConfigInput {
  modeId: string;
  variantId?: string | null;
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
}

export interface GameConfig {
  mode: GameMode;
  variant: ModeVariant | null;
  settings: SettingValues;
  common: CommonSettings;
  /** Keys (mode settings or common settings) the host cannot change. */
  locked: string[];
}

export type Resolved<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Combine mode defaults, the variant preset and the host's choices into
 * settings the game will actually run with. Variant-locked keys win.
 */
export function resolveGameConfig(input: GameConfigInput): Resolved<GameConfig> {
  let mode = getMode(input.modeId);
  let variant: ModeVariant | null = null;
  if (input.variantId) {
    variant = getVariant(input.variantId) ?? null;
    if (!variant) return { ok: false, message: 'That game variant does not exist.' };
    if (variant.meta.modeId !== input.modeId) mode = getMode(variant.meta.modeId);
  }
  if (!mode) return { ok: false, message: 'That game mode does not exist.' };
  if (mode.meta.status === 'planned' || variant?.meta.status === 'planned') return { ok: false, message: 'That mode is not playable yet.' };
  const locked = [...(variant?.locked ?? [])];
  const isLocked = (k: string) => locked.includes(k);

  const hostCommon = Object.fromEntries(Object.entries(input.common ?? {}).filter(([k]) => !isLocked(k)));
  const lockedCommon = Object.fromEntries(Object.entries(variant?.common ?? {}).filter(([k]) => isLocked(k)));
  const parsed = commonSettingsSchema.safeParse({ ...mode.defaults, ...variant?.common, ...hostCommon, ...lockedCommon });
  if (!parsed.success) return { ok: false, message: 'Some game settings are out of range.' };
  const common = parsed.data;
  if (mode.meta.teams === 'none') common.teamCount = 0;
  if (mode.meta.teams === 'required' && common.teamCount < 2) common.teamCount = 2;
  if (variant?.common?.teamCount && common.teamCount < 2) common.teamCount = variant.common.teamCount;

  const hostSettings = Object.fromEntries(Object.entries(input.settings ?? {}).filter(([k]) => !isLocked(k)));
  const lockedSettings = Object.fromEntries(Object.entries(variant?.settings ?? {}).filter(([k]) => isLocked(k)));
  const settings = parseSettings(mode.settings, { ...variant?.settings, ...hostSettings, ...lockedSettings });
  return { ok: true, value: { mode, variant, settings, common, locked } };
}

export interface PreparedQuestions extends AdaptResult {
  /** Why the set cannot be played in this mode, if it cannot. */
  problem: string | null;
}

/** Convert a set's questions to what the mode can show and check there are enough. */
export function prepareQuestions(mode: GameMode, questions: readonly Question[], seed: number): PreparedQuestions {
  const adapted = adaptQuestions(questions, mode.meta.questionTypes as QuestionType[], createRng(seed ^ 0x5eed));
  const need = mode.meta.minQuestions;
  const problem =
    adapted.questions.length < need
      ? `${mode.meta.title} needs at least ${need} questions it can show. This set has ${adapted.questions.length}${adapted.skipped.length ? ` (${adapted.skipped.length} skipped: ${adapted.skipped[0]!.reason})` : ''}.`
      : null;
  return { ...adapted, problem };
}
