import { z } from 'zod';
import {
  ANSWER_RULES,
  BLUEPRINT_ENDINGS,
  BLUEPRINT_EVENTS,
  BLUEPRINT_KINDS,
  BLUEPRINT_PACINGS,
  KIND_INFO,
  POWER_UPS,
  SCENE_PLACES,
  blankBlueprint,
  parseBlueprint,
  withKind,
  type Blueprint,
} from '@ludora/shared';
import { registerAiTask, TaskReject } from '../tasks.ts';

/*
 * Mode Studio: "describe your game" drafts a blueprint. The model answers in a small flat shape
 * of Ludora's own parts; the server builds the blueprint from it and runs the same check every
 * saved game passes (parseBlueprint, word filter included). The studio shows the result as a
 * suggestion to accept, and nothing is saved until the maker saves it.
 */

const draftSchema = z.object({
  name: z.string().max(80),
  unit: z.string().max(40).optional(),
  goal: z.string().max(200).optional(),
  howTo: z.array(z.string().max(200)).max(6).optional(),
  kind: z.enum(BLUEPRINT_KINDS),
  size: z.number().optional(),
  twist: z.boolean().optional(),
  pacing: z.enum(BLUEPRINT_PACINGS).optional(),
  rule: z.enum(ANSWER_RULES).optional(),
  right: z.number().optional(),
  wrong: z.number().optional(),
  speed: z.number().optional(),
  streak: z.number().optional(),
  outcomes: z.array(z.object({ label: z.string().max(40), weight: z.number(), amount: z.number() })).max(4).optional(),
  powers: z.array(z.enum(POWER_UPS)).max(5).optional(),
  events: z.array(z.enum(BLUEPRINT_EVENTS)).max(2).optional(),
  ending: z.enum(BLUEPRINT_ENDINGS).optional(),
  minutes: z.number().optional(),
  questions: z.number().optional(),
  place: z.enum(SCENE_PLACES).optional(),
  threeD: z.boolean().optional(),
  hue: z.number().optional(),
});
export type ModeDraft = z.infer<typeof draftSchema>;

const clamp = (n: number | undefined, min: number, max: number, fallback: number) => (n === undefined || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, Math.round(n))));

/** Build a blueprint from a model's draft, keeping within every limit. The check still runs after. */
export function blueprintFromDraft(d: ModeDraft): Blueprint {
  const info = KIND_INFO[d.kind];
  let bp = withKind(blankBlueprint(), d.kind);
  const size = clamp(d.size, info.size.min, info.size.max, info.size.default);
  bp = {
    ...bp,
    name: d.name.trim().slice(0, 40),
    unit: (d.unit ?? info.unit).trim().slice(0, 16),
    goal: (d.goal ?? '').trim().slice(0, 120),
    howTo: (d.howTo ?? []).map((l) => l.trim().slice(0, 90)).filter((l) => l.length >= 3).slice(0, 4),
    pacing: d.pacing ?? bp.pacing,
    kind: { type: d.kind, [info.size.key]: size, twist: Boolean(d.twist) } as Blueprint['kind'],
    answer: {
      rule: d.rule ?? 'steady',
      right: clamp(d.right, 1, 10, 2),
      wrong: clamp(d.wrong, 0, 5, 0),
      speed: clamp(d.speed, 0, 5, 0),
      streak: clamp(d.streak, 0, 5, 0),
      outcomes: (d.outcomes ?? []).map((o) => ({ label: o.label.trim().slice(0, 20), weight: clamp(o.weight, 1, 10, 1), amount: clamp(o.amount, 0, 10, 1) })),
    },
    extras: { powers: [...new Set(d.powers ?? [])], powerEvery: 4, events: [...new Set(d.events ?? [])] },
    end: { ...bp.end, type: d.ending && info.endings.includes(d.ending) ? d.ending : info.endings[0]!, timeLimitSec: clamp(d.minutes, 1, 15, 5) * 60, questions: clamp(d.questions, 5, 50, 20) },
    look: { ...bp.look, hue: clamp(d.hue, 0, 359, 210), dimension: d.threeD && (d.kind === 'race' || d.kind === 'climb') ? '3d' : '2d', scene: { ...bp.look.scene, place: d.place ?? 'meadow' } },
    cover: { ...bp.cover, hue: clamp(d.hue, 0, 359, 210) },
  };
  if (bp.answer.rule === 'chance' && bp.answer.outcomes.length < 2) bp.answer = { ...bp.answer, rule: 'steady', outcomes: [] };
  // Parts that act on others never go in a game played together (the check would refuse them).
  if (bp.kind.type === 'build' || bp.end.type === 'together') bp.extras = { ...bp.extras, powers: bp.extras.powers.filter((p) => p !== 'freeze' && p !== 'gust') };
  return bp;
}

registerAiTask({
  id: 'mode.draft',
  title: 'Draft a made game from a description',
  audience: ['teacher', 'student'],
  input: z.object({ description: z.string().trim().min(10, 'Describe your game in a sentence or two.').max(600) }),
  prompt: (i) => ({
    system: [
      'You design classroom quiz games for Ludora from parts it already has. Players answer quiz questions; the parts decide what an answer does.',
      `kind: one of ${BLUEPRINT_KINDS.join(', ')} (race along a track, climb, collect gems on a grid, build one tower together, territory on a shared map, survive with lives, team tug of war).`,
      `size: the goal number (race track 10-60, climb height 10-60, gems 5-60, tower bricks 10-400, map side 4-8, lives 1-5, rope 5-40). twist: true or false.`,
      `pacing: rounds (everyone together) or own-pace. rule: points (right, speed, streak bonuses), steady, or chance (2-4 outcomes with label, weight 1-10, amount 0-10).`,
      `right 1-10, wrong 0-5. powers: any of ${POWER_UPS.join(', ')}. events: any of ${BLUEPRINT_EVENTS.join(', ')}. ending: most, first, last (lives only) or together (build only).`,
      `minutes 1-15, questions 5-50, place one of ${SCENE_PLACES.join(', ')}, threeD true only for race or climb, hue 0-359.`,
      'name at most 40 characters, unit is what players gather (plural, at most 16 characters), goal one sentence, howTo up to 4 short lines. British English, kind and classroom-appropriate. Never name a real game or product.',
    ].join('\n'),
    user: `Describe the game:\n${i.description}`,
  }),
  output: draftSchema,
  example: '{"name":"Comet climb","unit":"metres","goal":"Climb to the top first.","howTo":["Right answers climb."],"kind":"climb","size":30,"twist":true,"pacing":"rounds","rule":"points","right":2,"wrong":1,"speed":1,"streak":1,"powers":["shield"],"events":[],"ending":"first","minutes":8,"questions":20,"place":"canyon","threeD":true,"hue":25}',
  validate: (w) => {
    const r = parseBlueprint(blueprintFromDraft(w));
    if (!r.ok) throw new TaskReject(r.problems[0]!.message);
    return { output: { blueprint: r.blueprint } };
  },
});
