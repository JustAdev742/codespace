import type { z } from 'zod';
import { containsBlockedLanguage } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { AuthContext } from '../../http/context.ts';

/*
 * The AI task registry. Every helper request is one registered task: the
 * browser sends only that task's own fields, and the task (on the server)
 * builds the prompt and checks the answer. There is no free chat and no way
 * for a browser to send instructions to a model.
 *
 * To add a helper, call registerAiTask() from your own module and import that
 * module once from tasks/index.ts. docs/features/ai.md has a worked example.
 */

/** Who a task is for: teacher accounts (and creators and staff), or student and player accounts. */
export type AiAudience = 'teacher' | 'student';

export interface AiTaskContext {
  deps: AppDeps;
  auth: AuthContext;
}

/**
 * An answer the task cannot use. Thrown from `validate`: the model is asked
 * once more with this message, then the request fails as unusable.
 */
export class TaskReject extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskReject';
  }
}

/** A request the task refuses before any model is asked (a set that is not yours, say). Shown to the person as it is. */
export class TaskInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'TaskInputError';
  }
}

export interface AiTask<I = unknown, P = I, W = unknown, O = unknown> {
  /** Stable id, "area.job", e.g. "question.explain". */
  id: string;
  /** A plain name for logs and the staff page. */
  title: string;
  audience: readonly AiAudience[];
  /** The fields the browser sends. Anything else is dropped. */
  input: z.ZodType<I>;
  /** Server-side work before the prompt: load the person's own records, check they may use them. Defaults to the input as it is. */
  prepare?: (input: I, ctx: AiTaskContext) => Promise<P> | P;
  /** The prompt, built only on the server. The user text has email addresses and phone numbers taken out before sending. */
  prompt: (prepared: P) => { system: string; user: string };
  /** The JSON the model must answer with. Checked first; a mismatch gets one repair attempt. */
  output: z.ZodType<W>;
  /** A short example of the answer's shape, put in the prompt for models without a JSON mode. */
  example: string;
  /** Ludora's own rules on top of the shape. Drops what breaks them; throws TaskReject when nothing is usable. */
  validate: (wire: W, prepared: P, ctx: AiTaskContext) => { output: O; dropped?: number } | Promise<{ output: O; dropped?: number }>;
  /** Room for the answer, in tokens. */
  maxTokens?: number;
}

// Tasks are stored with their types erased; each task checks its own input and output at run time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTask = AiTask<any, any, any, any>;

const registry = new Map<string, AnyTask>();

/** Adds a task. Ids are unique: registering one twice is a programming error. */
export function registerAiTask<I, W, O, P = I>(
  task: Omit<AiTask<I, P, W, O>, 'prompt' | 'validate'> & {
    prompt: (prepared: NoInfer<P>) => { system: string; user: string };
    validate: (wire: NoInfer<W>, prepared: NoInfer<P>, ctx: AiTaskContext) => { output: O; dropped?: number } | Promise<{ output: O; dropped?: number }>;
  },
): AiTask<I, P, W, O> {
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(task.id)) throw new Error(`AI task ids look like "area.job": ${task.id}`);
  if (registry.has(task.id)) throw new Error(`AI task ${task.id} is registered twice`);
  registry.set(task.id, task as AnyTask);
  return task;
}

export function getAiTask(id: string): AnyTask | undefined {
  return registry.get(id);
}

export function listAiTasks(): AnyTask[] {
  return [...registry.values()];
}

/* -------------------------------- Shared checks -------------------------------- */

/**
 * Trimmed text with its spaces tidied, or null when empty. For a single answer (an explanation, a
 * title): the runner holds back a whole answer that fails the word filter and says so.
 */
export function tidy(s: string): string | null {
  return s.replace(/\s+/g, ' ').trim() || null;
}

/** Trimmed text that passes Ludora's word filter, or null. For items in a list, so one bad item is dropped and the rest kept. */
export function cleanLine(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t || containsBlockedLanguage(t)) return null;
  return t;
}

/** Every string anywhere in a value. */
export function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** True when any string in the value fails the word filter. */
export function failsFilter(value: unknown): boolean {
  return allStrings(value).some((s) => containsBlockedLanguage(s));
}
