import { randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { AI_DRAFT_LEVEL_LABELS, AI_DRAFT_LEVELS, LESSON_LIMITS, lessonStepSchema, type AiDraftLevel, type LessonStep } from '@ludora/shared';
import { questionSets } from '../../../db/schema.ts';
import { loadSet, setAccess, validQuestions } from '../../sets/access.ts';
import { cleanLine, registerAiTask, TaskInputError, TaskReject, tidy } from '../tasks.ts';
import { hostableModes } from './games.ts';

/*
 * Helpers in the lesson editor: outline a lesson from a goal and the
 * teacher's own sets, write an info slide, and write discussion questions for
 * a set. Outlines only use sets the teacher owns and modes the catalogue
 * offers; every step is checked with the same rules a saved lesson must pass.
 */

const levelLine = (l: AiDraftLevel | undefined) => (l ? `Pupils: ${AI_DRAFT_LEVEL_LABELS[l]}` : 'Pupils: school age, 8 to 17');
const stepId = () => `s${randomBytes(4).toString('hex')}`;
const DISCUSSION_SECONDS = [30, 60, 90, 120, 180, 300, 600];
const nearestSeconds = (n: number) => DISCUSSION_SECONDS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 120);
const LESSON_RULES = 'Keep everything classroom-appropriate and in plain words for the pupils named. Never ask pupils about private matters, and never name real private individuals.';

/** Slide lines that pass the filter and fit a slide; how many were left out. */
function slideLines(lines: readonly string[]): { lines: string[]; dropped: number } {
  const out: string[] = [];
  let dropped = 0;
  for (const raw of lines) {
    const t = cleanLine(raw);
    if (!t || t.length > LESSON_LIMITS.line || out.length >= LESSON_LIMITS.lines) dropped++;
    else out.push(t);
  }
  return { lines: out, dropped };
}

const wireStep = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('game'), setId: z.string().max(60), modeId: z.string().max(60).default('classic'), title: z.string().max(200).default('') }),
  z.object({ kind: z.literal('slide'), title: z.string().max(200), lines: z.array(z.string().max(400)).max(12).default([]) }),
  z.object({ kind: z.literal('discussion'), prompt: z.string().max(400), seconds: z.number().default(120) }),
]);

registerAiTask({
  id: 'lesson.outline',
  title: 'Outline a lesson',
  audience: ['teacher'],
  input: z.object({ goal: z.string().trim().min(3, 'Say what the lesson is for.').max(200), level: z.enum(AI_DRAFT_LEVELS).optional(), minutes: z.number().int().min(10).max(120).default(45), setIds: z.array(z.string().uuid()).max(12).default([]) }),
  prepare: async (i, ctx) => {
    const ids = [...new Set(i.setIds)];
    const sets = ids.length
      ? await ctx.deps.db
          .select({ id: questionSets.id, title: questionSets.title, count: questionSets.questionCount })
          .from(questionSets)
          .where(and(inArray(questionSets.id, ids), eq(questionSets.ownerId, ctx.auth.user.id), isNull(questionSets.deletedAt)))
      : [];
    // Only the teacher's own sets: one that is not theirs is refused, not quietly skipped.
    if (sets.length !== ids.length) throw new TaskInputError('Choose from your own question sets.', 403);
    const modes = (await hostableModes(ctx)).map((m) => ({ id: m.meta.id, title: m.meta.title, tagline: m.meta.tagline }));
    return { ...i, sets, modes };
  },
  prompt: (p) => ({
    system: `You outline a lesson for a teacher using Ludora, a classroom quiz game. A lesson is a short list of steps the class meets in order: "game" steps play one of the teacher's question sets in a game mode, "slide" steps teach something on the big screen (a title and up to ${LESSON_LIMITS.lines} short lines), and "discussion" steps put one question to talk about in pairs, with a timer in seconds. A good lesson opens with something short, teaches, practises, talks, and checks at the end. Use only the sets and modes listed, by their ids; with no sets, use slides and discussions only. Give the lesson a short title and up to ${LESSON_LIMITS.goals} goals that finish the sentence "Today we...". ${LESSON_RULES}`,
    user: [
      `Goal: ${p.goal}`,
      levelLine(p.level),
      `Length: about ${p.minutes} minutes`,
      p.sets.length ? `The teacher's sets (id: title, questions):\n${p.sets.map((s) => `- ${s.id}: ${s.title}, ${s.count} questions`).join('\n')}` : 'The teacher chose no sets.',
      `Game modes (id: name, what it is):\n${p.modes.map((m) => `- ${m.id}: ${m.title}. ${m.tagline}`).join('\n')}`,
    ].join('\n'),
  }),
  output: z.object({ title: z.string().max(200), goals: z.array(z.string().max(300)).max(10).default([]), steps: z.array(z.unknown()).min(1).max(20) }),
  example: '{"title":"...","goals":["learned..."],"steps":[{"kind":"slide","title":"...","lines":["..."]},{"kind":"game","setId":"<one of the ids>","modeId":"classic","title":"Starter"},{"kind":"discussion","prompt":"...","seconds":120}]}',
  maxTokens: 3000,
  validate: (w, p) => {
    const title = tidy(w.title)?.slice(0, LESSON_LIMITS.title);
    if (!title) throw new TaskReject('Give the lesson a title.');
    let dropped = 0;
    const goals = w.goals.flatMap((g) => {
      const t = cleanLine(g);
      if (!t || t.length > LESSON_LIMITS.goal) return (dropped++, []);
      return [t];
    }).slice(0, LESSON_LIMITS.goals);
    const steps: LessonStep[] = [];
    for (const raw of w.steps) {
      const s = wireStep.safeParse(raw);
      let step: unknown = null;
      if (s.success && s.data.kind === 'game') {
        const g = s.data;
        const set = p.sets.find((x) => x.id === g.setId);
        const modeId = p.modes.some((m) => m.id === g.modeId) ? g.modeId : 'classic';
        if (set) step = { id: stepId(), kind: 'game', title: (cleanLine(g.title) ?? '').slice(0, LESSON_LIMITS.title), setId: set.id, modeId, variantId: null, settings: {}, common: {}, note: '' };
      } else if (s.success && s.data.kind === 'slide') {
        const t = cleanLine(s.data.title);
        const { lines, dropped: d } = slideLines(s.data.lines);
        dropped += d;
        if (t && t.length <= LESSON_LIMITS.title) step = { id: stepId(), kind: 'slide', title: t, lines, image: null, note: '' };
      } else if (s.success && s.data.kind === 'discussion') {
        const t = cleanLine(s.data.prompt);
        if (t && t.length <= LESSON_LIMITS.prompt) step = { id: stepId(), kind: 'discussion', prompt: t, seconds: nearestSeconds(s.data.seconds), note: '' };
      }
      const checked = step ? lessonStepSchema.safeParse(step) : null;
      if (!checked?.success || steps.length >= LESSON_LIMITS.steps) dropped++;
      else steps.push(checked.data);
    }
    if (!steps.length) throw new TaskReject('None of the steps could be used. Use only the set ids and step kinds described.');
    return { output: { title, goals, steps }, dropped };
  },
});

registerAiTask({
  id: 'lesson.slide',
  title: 'Write an info slide',
  audience: ['teacher'],
  input: z.object({ topic: z.string().trim().min(3, 'Say what the slide is about.').max(200), lessonTitle: z.string().trim().max(80).default(''), level: z.enum(AI_DRAFT_LEVELS).optional() }),
  prompt: (i) => ({
    system: `You write one info slide for a lesson in Ludora, shown on a classroom's big screen: a short title and two to ${LESSON_LIMITS.lines} short lines, each one fact or step, under ${LESSON_LIMITS.line} characters. ${LESSON_RULES}`,
    user: [`The slide is about: ${i.topic}`, i.lessonTitle ? `Lesson: ${i.lessonTitle}` : '', levelLine(i.level)].filter(Boolean).join('\n'),
  }),
  output: z.object({ title: z.string().max(200), lines: z.array(z.string().max(400)).max(12) }),
  example: '{"title":"...","lines":["...","..."]}',
  validate: (w) => {
    const title = tidy(w.title);
    if (!title || title.length > LESSON_LIMITS.title) throw new TaskReject(`Give the slide a title of ${LESSON_LIMITS.title} characters or fewer.`);
    const { lines, dropped } = slideLines(w.lines);
    if (!lines.length) throw new TaskReject(`Write at least one line under ${LESSON_LIMITS.line} characters.`);
    return { output: { title, lines }, dropped };
  },
});

registerAiTask({
  id: 'lesson.discussion',
  title: 'Write discussion questions',
  audience: ['teacher'],
  input: z.object({ setId: z.string().uuid() }),
  prepare: async (i, ctx) => {
    const set = await loadSet(ctx.deps.db, i.setId);
    if (!set || !(await setAccess(ctx.deps.db, set, ctx.auth)).view) throw new TaskInputError('That question set could not be found.', 404);
    return { title: set.title, prompts: validQuestions(set).slice(0, 30).map((q) => q.prompt) };
  },
  prompt: (p) => ({
    system: `You write questions for pupils to talk about in pairs during a lesson in Ludora, after or before playing a set of quiz questions. Each is open (no single right answer), makes pupils explain their thinking about the topic, and is under ${LESSON_LIMITS.prompt} characters. Write three to five. ${LESSON_RULES}`,
    user: [`Set: ${p.title}`, 'Its questions:', ...p.prompts.map((q) => `- ${q}`)].join('\n'),
  }),
  output: z.object({ prompts: z.array(z.string().max(400)).max(10) }),
  example: '{"prompts":["...","...","..."]}',
  validate: (w) => {
    const prompts: string[] = [];
    let dropped = 0;
    for (const raw of w.prompts) {
      const t = cleanLine(raw);
      if (!t || t.length > LESSON_LIMITS.prompt || prompts.includes(t) || prompts.length >= 5) dropped++;
      else prompts.push(t);
    }
    if (!prompts.length) throw new TaskReject(`Write at least one question under ${LESSON_LIMITS.prompt} characters.`);
    return { output: { prompts }, dropped };
  },
});
