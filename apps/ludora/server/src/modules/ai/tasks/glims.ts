import { z } from 'zod';
import {
  GLIM_BACKS,
  GLIM_BODIES,
  GLIM_BROWS,
  GLIM_EARS,
  GLIM_EYES,
  GLIM_FACES,
  GLIM_FEET,
  GLIM_GRADIENTS,
  GLIM_IDLES,
  GLIM_MOUTHS,
  GLIM_PATTERNS,
  GLIM_SHAPE_RANGES,
  GLIM_TAILS,
  GLIM_TOPPERS,
  designNameSchema,
  glimArtSchema,
  tidyGlim,
} from '@ludora/shared';
import { registerAiTask, TaskReject } from '../tasks.ts';

/*
 * "Describe a Glim" (studio2): a person describes the Glim they want in words and gets a design back
 * as parameters from the Glim vocabulary, checked against the same schema and caps as any design
 * the server saves. Nothing is saved: the editor shows it, and the person accepts it into the
 * editor (with undo) and saves it the usual way, where the server checks it again.
 */

const CHOICES = {
  body: GLIM_BODIES,
  eyes: GLIM_EYES,
  mouth: GLIM_MOUTHS,
  brows: GLIM_BROWS,
  pattern: GLIM_PATTERNS,
  topper: GLIM_TOPPERS,
  ears: GLIM_EARS,
  tail: GLIM_TAILS,
  back: GLIM_BACKS,
  face: GLIM_FACES,
  feet: GLIM_FEET,
  gradient: GLIM_GRADIENTS,
  idle: GLIM_IDLES,
} as const;

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(lo, Math.min(hi, n))) : fallback);

registerAiTask({
  id: 'glim.describe',
  title: 'Describe a Glim',
  audience: ['teacher', 'student'],
  input: z.object({ description: z.string().trim().min(3, 'Say what your Glim should look like.').max(300) }),
  prompt: (i) => ({
    system: [
      'You design a character called a Glim for a classroom game, by choosing from fixed lists. Answer with JSON only.',
      ...Object.entries(CHOICES).map(([k, list]) => `${k}: one of ${list.join(', ')}`),
      'hue, accentHue, thirdHue: colour wheel degrees 0 to 359. saturation: 0 to 100.',
      `width ${GLIM_SHAPE_RANGES.width.join(' to ')}, height ${GLIM_SHAPE_RANGES.height.join(' to ')}, eyeSize ${GLIM_SHAPE_RANGES.eyeSize.join(' to ')} (percent; 100 is normal).`,
      'name: a friendly name of one or two words, at most 24 characters, no real people. Keep everything kind and classroom-appropriate.',
    ].join('\n'),
    user: `The Glim I want: ${i.description}`,
  }),
  output: z.object({
    name: z.string().max(80).optional(),
    body: z.string().max(40),
    eyes: z.string().max(40),
    mouth: z.string().max(40),
    brows: z.string().max(40).optional(),
    pattern: z.string().max(40).optional(),
    topper: z.string().max(40).optional(),
    ears: z.string().max(40).optional(),
    tail: z.string().max(40).optional(),
    back: z.string().max(40).optional(),
    face: z.string().max(40).optional(),
    feet: z.string().max(40).optional(),
    gradient: z.string().max(40).optional(),
    idle: z.string().max(40).optional(),
    hue: z.number(),
    accentHue: z.number(),
    thirdHue: z.number().optional(),
    saturation: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    eyeSize: z.number().optional(),
  }),
  example: '{"name":"Moss Pup","body":"blob","eyes":"dot","mouth":"smile","ears":"bear","topper":"leaf","feet":"paws","hue":110,"accentHue":40,"saturation":60,"width":105,"height":95,"eyeSize":110}',
  validate: (w) => {
    const art: Record<string, unknown> = { kind: 'glim', cheeks: false };
    for (const [k, list] of Object.entries(CHOICES)) {
      const v = (w as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (!(list as readonly string[]).includes(String(v))) throw new TaskReject(`${k} must be one of: ${list.join(', ')}.`);
      art[k] = v;
    }
    art.pattern ??= 'none';
    art.topper ??= 'none';
    art.hue = clamp(w.hue, 0, 359, 200);
    art.accentHue = clamp(w.accentHue, 0, 359, 40);
    if (w.thirdHue !== undefined) art.thirdHue = clamp(w.thirdHue, 0, 359, 120);
    art.saturation = clamp(w.saturation, 0, 100, 70);
    art.width = clamp(w.width, GLIM_SHAPE_RANGES.width[0], GLIM_SHAPE_RANGES.width[1], 100);
    art.height = clamp(w.height, GLIM_SHAPE_RANGES.height[0], GLIM_SHAPE_RANGES.height[1], 100);
    art.eyeSize = clamp(w.eyeSize, GLIM_SHAPE_RANGES.eyeSize[0], GLIM_SHAPE_RANGES.eyeSize[1], 100);
    const parsed = glimArtSchema.safeParse(art);
    if (!parsed.success) throw new TaskReject(`That is not a valid Glim: ${parsed.error.issues[0]?.message ?? 'check the choices'}.`);
    // A name that breaks the rules is simply left out: the person names it themselves.
    const name = w.name ? designNameSchema.safeParse(w.name.replace(/^["'“”]+|["'“”]+$/g, '')) : null;
    return { output: { art: tidyGlim(parsed.data), name: name?.success ? name.data : null } };
  },
});
