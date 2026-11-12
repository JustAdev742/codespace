import { z } from 'zod';
import { registerAiTask, TaskReject, tidy } from '../tasks.ts';

/*
 * A generic "name and describe this" helper any making tool can reuse: send
 * what the thing is (its kind and a summary of its content) and get a short
 * name and a one-line description back, within the limits the tool gives.
 */

export const NAMEABLE = ['game', 'lesson', 'set', 'glim', 'mode', 'item', 'other'] as const;

registerAiTask({
  id: 'any.name_describe',
  title: 'Name and describe this',
  audience: ['teacher', 'student'],
  input: z.object({
    kind: z.enum(NAMEABLE),
    content: z.string().trim().min(3, 'There is nothing to describe yet.').max(2000),
    nameMax: z.number().int().min(10).max(80).default(40),
    descriptionMax: z.number().int().min(40).max(500).default(200),
  }),
  prompt: (i) => ({
    system: `You name and describe things people make in Ludora, a classroom quiz game: a short, friendly name (at most ${i.nameMax} characters, sentence case, no quotation marks) and one sentence saying what it is (at most ${i.descriptionMax} characters). Keep it classroom-appropriate. Never use real people's names.`,
    user: `Kind of thing: ${i.kind}\nWhat it is:\n${i.content}`,
  }),
  output: z.object({ name: z.string().max(200), description: z.string().max(1000) }),
  example: '{"name":"...","description":"..."}',
  validate: (w, i) => {
    const name = tidy(w.name.replace(/^["'“”]+|["'“”]+$/g, ''));
    if (!name || name.length > i.nameMax) throw new TaskReject(`Give a name of ${i.nameMax} characters or fewer.`);
    const description = tidy(w.description) ?? '';
    if (description.length > i.descriptionMax) throw new TaskReject(`Keep the description to ${i.descriptionMax} characters.`);
    return { output: { name, description } };
  },
});
