import { z } from 'zod';
import { AI_DRAFT_LEVEL_LABELS, AI_DRAFT_LEVELS, AI_DRAFT_TYPES, aiDraftRequestSchema, QUESTION_TYPES, questionSchema, type AiDraftLevel, type Question } from '@ludora/shared';
import { fromWire, languageName, SYSTEM as DRAFT_SYSTEM, toQuestions, toWire, userMessage, wireDrafts, wireQuestion } from '../drafter.ts';
import { cleanLine, failsFilter, tidy, registerAiTask, TaskInputError, TaskReject } from '../tasks.ts';

/*
 * Helpers in the set editor: draft questions, improve one question's wording,
 * write wrong answers, write the explanation, make a question easier or
 * harder, make a version of a set for another age group, and suggest a set's
 * title, description and tags. Every answer is checked against the same
 * question rules a saved set must pass, and against the word filter.
 */

const level = z.enum(AI_DRAFT_LEVELS).optional();
const levelLine = (l: AiDraftLevel | undefined) => (l ? `Players: ${AI_DRAFT_LEVEL_LABELS[l]}` : 'Players: school age, 8 to 17');
const key = (s: string) => s.trim().toLocaleLowerCase();
const QUESTION_RULES = 'Keep everything factually correct and classroom-appropriate, in plain words for the players named. Never ask players about themselves or name real private individuals.';

/* ------------------------------- Draft questions ------------------------------ */

registerAiTask({
  id: 'set.draft_questions',
  title: 'Draft questions',
  audience: ['teacher', 'student'],
  input: aiDraftRequestSchema,
  prompt: (r) => ({ system: DRAFT_SYSTEM, user: userMessage(r) }),
  output: wireDrafts,
  example: '{"questions":[{"type":"mcq","prompt":"...","choices":[{"text":"...","correct":true},{"text":"...","correct":false}],"explanation":"..."},{"type":"truefalse","prompt":"...","answer":true,"explanation":"..."}]}',
  maxTokens: 6000,
  validate: (wire, r) => {
    const { questions, dropped } = toQuestions(wire, r);
    // Drafts that fail the word filter are dropped one by one, like drafts that break a rule.
    const kept = questions.filter((q) => !failsFilter(q));
    if (!kept.length) throw new TaskReject(`None of the questions could be used (${dropped + questions.length} broke the rules). Follow the kinds and rules exactly.`);
    return { output: kept, dropped: dropped + questions.length - kept.length };
  },
});

/* ------------------------------ One question at a time ------------------------------ */

const questionText = z.string().trim().min(1).max(500);
const answerText = z.string().trim().max(300);

registerAiTask({
  id: 'question.improve',
  title: 'Improve the wording',
  audience: ['teacher', 'student'],
  input: z.object({ type: z.enum(QUESTION_TYPES), prompt: questionText, answer: answerText.default(''), level }),
  prompt: (i) => ({
    system: `You improve the wording of one quiz question for Ludora, a classroom quiz game. Make it clearer, shorter and easier to read aloud, without changing what it asks or its answer. Keep any maths written between dollar signs exactly as it is. ${QUESTION_RULES}`,
    user: [`Question: ${i.prompt}`, `Kind of question: ${i.type}`, i.answer ? `Its answer: ${i.answer}` : '', levelLine(i.level)].filter(Boolean).join('\n'),
  }),
  output: z.object({ prompt: z.string().max(500) }),
  example: '{"prompt":"The improved question"}',
  validate: (w) => {
    const prompt = tidy(w.prompt);
    if (!prompt) throw new TaskReject('The prompt was empty.');
    return { output: { prompt } };
  },
});

registerAiTask({
  id: 'question.wrong_answers',
  title: 'Write wrong answers',
  audience: ['teacher', 'student'],
  input: z.object({ prompt: questionText, correct: z.string().trim().min(1).max(200), wrong: z.array(z.string().trim().max(200)).max(7).default([]), count: z.number().int().min(1).max(5).default(3), level }),
  prompt: (i) => ({
    system: `You write wrong answers for one multiple-choice quiz question in Ludora, a classroom quiz game. Each wrong answer must be clearly wrong to someone who knows the topic, but believable to someone still learning it. Keep them short, in the same style and length as the right answer. Never use "all of the above" or "none of the above". ${QUESTION_RULES}`,
    user: [`Question: ${i.prompt}`, `Right answer: ${i.correct}`, i.wrong.filter(Boolean).length ? `Wrong answers it already has: ${i.wrong.filter(Boolean).join('; ')}` : '', `Write ${i.count} new wrong answers.`, levelLine(i.level)].filter(Boolean).join('\n'),
  }),
  output: z.object({ wrong: z.array(z.string()).max(12) }),
  example: '{"wrong":["...","...","..."]}',
  validate: (w, i) => {
    const taken = new Set([i.correct, ...i.wrong].map(key));
    const wrong: string[] = [];
    let dropped = 0;
    for (const raw of w.wrong) {
      const t = cleanLine(raw);
      if (!t || t.length > 200 || taken.has(key(t)) || /\b(all|none) of the above\b/i.test(t)) {
        dropped++;
        continue;
      }
      if (wrong.length >= i.count) break;
      taken.add(key(t));
      wrong.push(t);
    }
    if (!wrong.length) throw new TaskReject('Every wrong answer repeated an existing answer or was empty. Write new ones.');
    return { output: { wrong }, dropped };
  },
});

registerAiTask({
  id: 'question.explain',
  title: 'Write the explanation',
  audience: ['teacher', 'student'],
  input: z.object({ prompt: questionText, answer: z.string().trim().min(1).max(300), level }),
  prompt: (i) => ({
    system: `You write the explanation shown after the answer to one quiz question in Ludora, a classroom quiz game: one or two sentences that teach why the answer is right. ${QUESTION_RULES}`,
    user: [`Question: ${i.prompt}`, `Right answer: ${i.answer}`, levelLine(i.level)].join('\n'),
  }),
  output: z.object({ explanation: z.string().max(600) }),
  example: '{"explanation":"One or two sentences."}',
  validate: (w) => {
    const explanation = tidy(w.explanation);
    if (!explanation) throw new TaskReject('The explanation was empty.');
    return { output: { explanation } };
  },
});

/** Questions of the kinds drafts use, as the browser sends them (checked with the same rules as a saved set). */
const draftable = questionSchema.refine((q) => (AI_DRAFT_TYPES as readonly string[]).includes(q.type), 'AI helpers can rewrite multiple choice, true or false, short answer, number, fill-in-the-blanks and sorting questions.');

registerAiTask({
  id: 'question.difficulty',
  title: 'Make a question easier or harder',
  audience: ['teacher', 'student'],
  input: z.object({ question: draftable, direction: z.enum(['easier', 'harder']), level }),
  prompt: (i) => ({
    system: `${DRAFT_SYSTEM}\n\nThis time you rewrite one existing question to make it ${i.direction}, keeping its kind and its topic. Easier: simpler words, a more familiar example, clearer wrong answers. Harder: one more step of thinking, closer wrong answers. Answer with the rewritten question as {"question": {...}} in the same shape as the original.`,
    user: [`The question: ${JSON.stringify(toWire(i.question))}`, `Make it ${i.direction}.`, levelLine(i.level)].join('\n'),
  }),
  output: z.object({ question: z.unknown() }),
  example: '{"question":{"type":"mcq","prompt":"...","choices":[{"text":"...","correct":true},{"text":"...","correct":false}],"explanation":"..."}}',
  validate: (w, i) => {
    const wire = wireQuestion.safeParse(w.question);
    if (!wire.success) throw new TaskReject(`The question did not match the shape: ${wire.error.issues[0]?.message ?? 'unknown problem'}.`);
    if (wire.data.type !== i.question.type) throw new TaskReject(`Keep the kind of question: it must stay "${i.question.type}".`);
    const q = questionSchema.safeParse(fromWire(wire.data, i.question.id));
    if (!q.success) throw new TaskReject('The rewritten question broke a rule: check there is exactly one right answer and no repeated choices.');
    return { output: { question: { ...keepExtras(i.question), ...q.data } as Question } };
  },
});

/** What a rewrite keeps from the original that the model never sees: picture, time, points, tags. */
function keepExtras(q: Question): Partial<Question> {
  const { media, timeLimitSec, points, doublePoints, difficulty, tags } = q as Question & { difficulty?: unknown; tags?: unknown };
  return { ...(media ? { media } : {}), ...(timeLimitSec ? { timeLimitSec } : {}), ...(points !== undefined ? { points } : {}), ...(doublePoints ? { doublePoints } : {}), ...(difficulty ? { difficulty } : {}), ...(tags ? { tags } : {}) } as Partial<Question>;
}

/* ---------------------------------- Whole sets ---------------------------------- */

registerAiTask({
  id: 'set.age_version',
  title: 'Version for another age group',
  audience: ['teacher', 'student'],
  input: z.object({ title: z.string().trim().min(1).max(80), language: z.string().trim().min(2).max(10).default('en'), level: z.enum(AI_DRAFT_LEVELS), questions: z.array(z.unknown()).min(1).max(30) }),
  prepare: (i) => {
    // Only questions that pass the set rules and are of a kind the model can rewrite are sent.
    const questions = i.questions.map((q) => draftable.safeParse(q)).flatMap((r) => (r.success ? [r.data] : []));
    if (!questions.length) throw new TaskInputError('This set has no finished questions of a kind the helper can rewrite (multiple choice, true or false, short answer, number, fill in the blanks or sort).');
    return { ...i, questions };
  },
  prompt: (p) => ({
    system: `${DRAFT_SYSTEM}\n\nThis time you rewrite a whole existing set of questions for a different age group: keep each question's kind and topic, and its place in the list, and change the wording, the examples and the difficulty to suit the players named.`,
    user: [`Set: ${p.title}`, `Rewrite for: ${AI_DRAFT_LEVEL_LABELS[p.level]}`, `Write in: ${languageName(p.language)}`, `The ${p.questions.length} questions:`, ...p.questions.map((q, n) => `${n + 1}. ${JSON.stringify(toWire(q))}`)].join('\n'),
  }),
  output: wireDrafts,
  example: '{"questions":[{"type":"mcq","prompt":"...","choices":[{"text":"...","correct":true},{"text":"...","correct":false}],"explanation":"..."}]}',
  maxTokens: 8000,
  validate: (wire, p) => {
    const { questions, dropped } = toQuestions(wire, { count: p.questions.length, types: [...AI_DRAFT_TYPES] });
    const kept = questions.filter((q) => !failsFilter(q));
    if (!kept.length) throw new TaskReject('None of the rewritten questions could be used. Keep each question valid, with one right answer.');
    const title = `${p.title} (${AI_DRAFT_LEVEL_LABELS[p.level].replace(/^Ages /, 'ages ')})`.slice(0, 80);
    return { output: { title, questions: kept }, dropped: dropped + questions.length - kept.length };
  },
});

registerAiTask({
  id: 'set.describe',
  title: 'Suggest a title, description and tags',
  audience: ['teacher', 'student'],
  input: z.object({ title: z.string().trim().max(80).default(''), description: z.string().trim().max(500).default(''), subject: z.string().trim().max(30).default(''), prompts: z.array(z.string().trim().max(500)).min(1).max(40) }),
  prompt: (i) => ({
    system: `You suggest a title, a one or two sentence description and up to five short tags for a set of quiz questions in Ludora, a classroom quiz game. The title says what the set is about in a few words, sentence case. The description tells a teacher what the questions cover. Tags are single lower-case topic words or short phrases. Keep it classroom-appropriate.`,
    user: [i.title ? `Current title: ${i.title}` : '', i.description ? `Current description: ${i.description}` : '', i.subject ? `Subject: ${i.subject}` : '', 'Questions:', ...i.prompts.filter(Boolean).map((q) => `- ${q}`)].filter(Boolean).join('\n'),
  }),
  output: z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()).max(12) }),
  example: '{"title":"...","description":"...","tags":["...","..."]}',
  validate: (w) => {
    const title = tidy(w.title);
    if (!title || title.length > 80) throw new TaskReject('Give a title of 80 characters or fewer.');
    const description = (tidy(w.description) ?? '').slice(0, 300);
    const tags: string[] = [];
    let dropped = 0;
    for (const raw of w.tags) {
      const t = cleanLine(raw)?.toLocaleLowerCase();
      if (!t || t.length > 30 || tags.includes(t) || tags.length >= 5) dropped++;
      else tags.push(t);
    }
    return { output: { title, description, tags }, dropped };
  },
});

