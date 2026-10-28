import { z } from 'zod';
import { containsBlockedLanguage } from './validation.ts';

/*
 * A school's own events, set by a teacher for their class: a carnival, a
 * Book Week parade, a house day. The teacher writes the name, the dates and
 * a line about it; Ludora invents no school's dates and shows no crest or
 * logo, only the school name the teacher typed. Students see the event on
 * their home page, dressed in the decorations the teacher picked.
 */

/** Decorations an event can hang (the same set the seasonal calendar draws). */
export const EVENT_DECOR = ['bunting', 'lights', 'fireworks', 'lanterns', 'confetti', 'eggs', 'books', 'stars', 'leaves', 'blossoms', 'sun', 'rain', 'bats', 'snow'] as const;
export type EventDecor = (typeof EVENT_DECOR)[number];

const clean = (msg: string) => (s: string) => !containsBlockedLanguage(s) || msg;
const iso = z.string().datetime({ offset: true });

export const schoolNameSchema = z
  .string()
  .trim()
  .max(60, 'At most 60 characters.')
  .refine((s) => clean('x')(s) === true, 'Check the school name.')
  .nullable();

export const classEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Give the event a name.')
      .max(40, 'At most 40 characters.')
      .refine((s) => clean('x')(s) === true, 'Pick a different name.'),
    message: z
      .string()
      .trim()
      .max(120, 'At most 120 characters.')
      .refine((s) => clean('x')(s) === true, 'Reword the message.')
      .default(''),
    decor: z.enum(EVENT_DECOR),
    hue: z.number().int().min(0).max(359),
    startsAt: iso,
    endsAt: iso,
  })
  .refine((e) => Date.parse(e.startsAt) < Date.parse(e.endsAt), { message: 'The end has to come after the start.', path: ['endsAt'] })
  .refine((e) => Date.parse(e.endsAt) - Date.parse(e.startsAt) <= 31 * 86_400_000, { message: 'An event lasts a month at most.', path: ['endsAt'] });
export type ClassEventInput = z.infer<typeof classEventSchema>;
