import { z } from 'zod';
import { createRng, type SettingField } from '@ludora/shared';
import { CATALOG, type CatalogMode } from '@ludora/engine/catalog';
import { adaptQuestions } from '@ludora/engine/questions';
import { isFlagOn } from '../../flags/service.ts';
import { modeVisibility } from '../../modes/service.ts';
import { loadSet, setAccess, validQuestions } from '../../sets/access.ts';
import { registerAiTask, tidy, TaskInputError, TaskReject, type AiTaskContext } from '../tasks.ts';

/*
 * Suggest a game mode and its settings for a set, a class size and a length
 * of time, with one sentence of why. The model only chooses among modes the
 * real catalogue says this person may host and this set can fill; whatever it
 * answers is checked against that list and each mode's own settings fields.
 */

/** Modes a class plays together that this person may start now: not planned, not solo, not hidden, beta only with the flag. */
export async function hostableModes(ctx: AiTaskContext): Promise<CatalogMode[]> {
  const staff = ctx.auth.permissions.has('modes.manage');
  const vis = await modeVisibility(ctx.deps.db);
  const beta = staff || (await isFlagOn(ctx.deps.db, 'modes.beta', ctx.auth));
  return CATALOG.filter((m) => m.meta.status !== 'planned' && m.meta.pacing !== 'solo' && (staff || vis.get(m.meta.id) !== 'hidden') && (beta || m.meta.status !== 'beta')).map((m) => ({
    ...m,
    variants: m.variants.filter((v) => v.meta.status !== 'planned' && (staff || vis.get(v.meta.id) !== 'hidden') && (beta || v.meta.status !== 'beta')),
  }));
}

const COMMON_RANGES = { questionTimeSec: [5, 120], timeLimitSec: [0, 3600], questionLimit: [0, 250] } as const;

/** A setting value the field accepts, or undefined. */
export function settingValue(field: SettingField, value: unknown): number | string | boolean | undefined {
  if (field.kind === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max ? value : undefined;
  if (field.kind === 'select') return typeof value === 'string' && field.options.some((o) => o.value === value) ? value : undefined;
  return typeof value === 'boolean' ? value : undefined;
}

registerAiTask({
  id: 'game.suggest_mode',
  title: 'Suggest a game mode',
  audience: ['teacher', 'student'],
  input: z.object({ setId: z.string().uuid(), classSize: z.number().int().min(1).max(300), minutes: z.number().int().min(3).max(120) }),
  prepare: async (i, ctx) => {
    const set = await loadSet(ctx.deps.db, i.setId);
    if (!set || !(await setAccess(ctx.deps.db, set, ctx.auth)).view) throw new TaskInputError('That question set could not be found.', 404);
    const questions = validQuestions(set);
    const rng = createRng(1);
    const modes = (await hostableModes(ctx))
      .filter((m) => m.meta.players.min <= i.classSize)
      .map((m) => ({ mode: m, fit: adaptQuestions(questions, m.meta.questionTypes, rng).questions.length }))
      .filter((x) => x.fit >= Math.max(1, x.mode.meta.minQuestions));
    if (!modes.length) throw new TaskInputError('No game mode can play this set for a group that size. Add more questions, or check the set in the editor.');
    const types = [...new Set(questions.map((q) => q.type))];
    return { ...i, title: set.title, count: questions.length, types, modes };
  },
  prompt: (p) => ({
    system:
      'You suggest one game mode, and its settings, for a teacher running a classroom quiz game in Ludora. Choose only from the modes listed, by their id. Think about the class size, the time they have, how many questions the set has and the kinds of question. Settings you leave out keep the mode\'s own defaults, so only set what helps. "why" is one plain sentence to the teacher, under 200 characters.',
    user: [
      `Set: ${p.title} (${p.count} questions; kinds: ${p.types.join(', ')})`,
      `Players: ${p.classSize}`,
      `Time: about ${p.minutes} minutes`,
      'Modes you may choose (id: name, players, minutes, what it is; settings):',
      ...p.modes.map(({ mode: m, fit }) => {
        const settings = m.settings.map((f) => (f.kind === 'number' ? `${f.key} ${f.min}-${f.max}` : f.kind === 'select' ? `${f.key} one of ${f.options.map((o) => o.value).join('/')}` : `${f.key} true/false`));
        const variants = m.variants.length ? `; variants: ${m.variants.map((v) => `${v.meta.id} (${v.meta.tagline})`).join(', ')}` : '';
        return `- ${m.meta.id}: ${m.meta.title}, ${m.meta.players.min}-${m.meta.players.max} players, ${m.meta.duration.min}-${m.meta.duration.max} min, uses ${fit} questions. ${m.meta.tagline}. Shared settings: ${m.meta.common.fields.join(', ') || 'none'}${settings.length ? `; own settings: ${settings.join(', ')}` : ''}${variants}`;
      }),
    ].join('\n'),
  }),
  output: z.object({
    modeId: z.string().max(60),
    variantId: z.string().max(60).nullable().default(null),
    common: z.record(z.string(), z.unknown()).default({}),
    settings: z.record(z.string(), z.unknown()).default({}),
    why: z.string().max(400),
  }),
  example: '{"modeId":"classic","variantId":null,"common":{"questionTimeSec":20,"questionLimit":10},"settings":{},"why":"One plain sentence."}',
  validate: (w, p) => {
    const found = p.modes.find((x) => x.mode.meta.id === w.modeId);
    if (!found) throw new TaskReject(`"${w.modeId}" is not one of the modes listed. Choose one of: ${p.modes.map((x) => x.mode.meta.id).join(', ')}.`);
    const mode = found.mode;
    const variant = w.variantId ? (mode.variants.find((v) => v.meta.id === w.variantId) ?? null) : null;
    let dropped = w.variantId && !variant ? 1 : 0;
    const common: Record<string, number> = {};
    for (const [k, v] of Object.entries(w.common)) {
      const range = COMMON_RANGES[k as keyof typeof COMMON_RANGES];
      if (range && (mode.meta.common.fields as readonly string[]).includes(k) && typeof v === 'number' && Number.isInteger(v) && v >= range[0] && v <= range[1]) common[k] = v;
      else dropped++;
    }
    const settings: Record<string, number | string | boolean> = {};
    for (const [k, v] of Object.entries(w.settings)) {
      const field = mode.settings.find((f) => f.key === k);
      const value = field && !variant?.locked?.includes(k) ? settingValue(field, v) : undefined;
      if (value === undefined) dropped++;
      else settings[k] = value;
    }
    const why = tidy(w.why);
    if (!why) throw new TaskReject('Say why in one sentence.');
    return { output: { modeId: mode.meta.id, modeTitle: mode.meta.title, variantId: variant?.meta.id ?? null, variantTitle: variant?.meta.title ?? null, common, settings, why: why.slice(0, 200) }, dropped };
  },
});
