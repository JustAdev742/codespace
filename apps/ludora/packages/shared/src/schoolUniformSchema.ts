import { z } from 'zod';
import type { SchoolDress } from './schoolUniform.ts';

/** A player's school year, blazer and kit, as the server accepts them (schoolUniform.ts says what they mean). */
export const schoolDressSchema = z.object({
  year: z.number().int().min(0).max(12).nullable(),
  blazer: z.enum(['green', 'grey']),
  kit: z.enum(['school', 'sport']),
}) satisfies z.ZodType<SchoolDress>;
