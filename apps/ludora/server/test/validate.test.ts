import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parse } from '../src/lib/validate.ts';
import { AppError } from '../src/lib/errors.ts';

function fieldsOf(schema: z.ZodType, data: unknown): Record<string, string> {
  try {
    parse(schema, data);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError & { fields: Record<string, string> }).fields;
  }
  throw new Error('expected a validation error');
}

describe('validation messages', () => {
  it('says the validator’s default limits in plain words', () => {
    const schema = z.object({
      title: z.string().trim().min(2).max(80),
      name: z.string().min(1),
      tags: z.array(z.string()).max(3),
      count: z.number().int().min(1).max(1000),
      id: z.string().uuid(),
      kind: z.enum(['a', 'b']),
      missing: z.string(),
    });
    const fields = fieldsOf(schema, { title: 'x'.repeat(81), name: '', tags: ['a', 'b', 'c', 'd'], count: 5000, id: 'nope', kind: 'c' });
    expect(fields).toEqual({
      title: 'Use at most 80 characters.',
      name: 'This cannot be empty.',
      tags: 'At most 3 are allowed.',
      count: 'Use 1,000 or less.',
      id: 'That link or id is not valid.',
      kind: 'Choose one of the options offered.',
      missing: 'This is needed.',
    });
    expect(fieldsOf(schema.pick({ title: true }), { title: 'x' }).title).toBe('Use at least 2 characters.');
  });

  it('keeps a schema’s own message', () => {
    expect(fieldsOf(z.object({ code: z.string().regex(/^\d{6}$/, 'Game codes are 6 digits.') }), { code: 'ab' }).code).toBe('Game codes are 6 digits.');
    expect(fieldsOf(z.object({ n: z.string().min(3, 'Too short for a name.') }), { n: 'a' }).n).toBe('Too short for a name.');
  });
});
