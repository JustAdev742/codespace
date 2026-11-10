import type { z } from 'zod';
import { AppError } from './errors.ts';

/** The validator's own wording ("Too big: expected string to have <=80 characters"), which no person should see. */
const DEFAULT_WORDING = /^(Too (big|small)|Invalid|Expected|Unrecognized)/;

/**
 * A schema's own message when it has one; otherwise the validator's default,
 * said in plain words. Schemas written for a form give their own messages, but
 * many API fields only set limits, and those limits still reach a person as the
 * message under a field or in a toast.
 */
export function plainMessage(issue: z.core.$ZodIssue): string {
  if (!DEFAULT_WORDING.test(issue.message)) return issue.message;
  const i = issue as z.core.$ZodIssue & { origin?: string; minimum?: number | bigint; maximum?: number | bigint; input?: unknown; format?: string };
  const n = (v: number | bigint | undefined) => Number(v ?? 0).toLocaleString('en-GB');
  switch (i.code) {
    case 'too_small':
      if (i.origin === 'string') return Number(i.minimum) <= 1 ? 'This cannot be empty.' : `Use at least ${n(i.minimum)} characters.`;
      if (i.origin === 'array' || i.origin === 'set') return Number(i.minimum) <= 1 ? 'Add at least one.' : `Add at least ${n(i.minimum)}.`;
      return `Use ${n(i.minimum)} or more.`;
    case 'too_big':
      if (i.origin === 'string') return `Use at most ${n(i.maximum)} characters.`;
      if (i.origin === 'array' || i.origin === 'set') return `At most ${n(i.maximum)} are allowed.`;
      return `Use ${n(i.maximum)} or less.`;
    case 'invalid_type':
      return i.input === undefined || i.input === null ? 'This is needed.' : 'This is not the right kind of value.';
    case 'invalid_value':
      return 'Choose one of the options offered.';
    case 'invalid_format':
      return i.format === 'uuid' || i.format === 'guid' ? 'That link or id is not valid.' : i.format === 'datetime' ? 'That date is not valid.' : 'That is not in the right format.';
    case 'unrecognized_keys':
      return 'Something unexpected was sent. Reload the page and try again.';
    default:
      return 'Check this and try again.';
  }
}

/** Parse input with a schema, or throw a 400 listing what is wrong with each field. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= plainMessage(issue);
  }
  const first = Object.values(fields)[0] ?? 'Check the highlighted fields.';
  throw new AppError(400, 'validation_failed', first, fields);
}
