import type { z } from 'zod';
import { AppError } from './errors.ts';

/** Parse input with a schema, or throw a 400 listing what is wrong with each field. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Check the highlighted fields.';
  throw new AppError(400, 'validation_failed', first, fields);
}
