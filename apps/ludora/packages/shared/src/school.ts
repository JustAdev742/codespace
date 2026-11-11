import { z } from 'zod';
import { containsBlockedLanguage } from './validation.ts';
import { EVENT_DECOR } from './schoolEvents.ts';

/*
 * A school's own copy of Ludora: houses, house points, house cups, merits,
 * notices and school-wide events. Every name, colour, value and date here is
 * the school's own, typed by its staff: Ludora ships none of them. The server
 * checks every field with these schemas; the browser uses them only to show
 * the same messages before sending.
 */

/** Simple emblems a house can wear, drawn from Ludora's icon set (web/src/features/school/emblems.tsx). */
export const HOUSE_EMBLEMS = ['shield', 'star', 'flame', 'leaf', 'wave', 'mountain', 'crown', 'bird', 'anchor', 'sun', 'moon', 'bolt', 'tree', 'key', 'compass', 'heart'] as const;
export type HouseEmblem = (typeof HOUSE_EMBLEMS)[number];

/** At most this many houses: a team game can have six teams, so a house match can seat every house. */
export const MAX_HOUSES = 6;

const clean = (s: string) => !containsBlockedLanguage(s);
const iso = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-03-01.');

export const houseInputSchema = z.object({
  name: z.string().trim().min(2, 'Give the house a name of at least 2 characters.').max(30, 'At most 30 characters.').refine(clean, 'Pick a different name.'),
  hue: z.number().int().min(0).max(359),
  emblem: z.enum(HOUSE_EMBLEMS),
});
export type HouseInput = z.infer<typeof houseInputSchema>;

/** A house as anyone may see it. */
export interface HouseView {
  id: string;
  name: string;
  hue: number;
  emblem: HouseEmblem;
}

/** The house a player belongs to, as it travels with their avatar: no account details. */
export type HouseBadge = HouseView;

const value = z.string().trim().min(2, 'At least 2 characters.').max(30, 'At most 30 characters.').refine(clean, 'Pick a different word.');

function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const schoolSettingsSchema = z.object({
  /** Students may choose their own house once, when they have none. Teachers can always set it. */
  houseChoice: z.boolean().default(false),
  /** House points one student can earn in a day from games and assignments (merits are limited per teacher instead). */
  dailyCap: z.number().int().min(1).max(500).default(20),
  /** House points for each question answered right (each question counts once per game). */
  pointsPerCorrect: z.number().int().min(1).max(10).default(1),
  /** House points a merit earns. */
  meritPoints: z.number().int().min(0).max(50).default(5),
  /** Merits one teacher can give in a day. */
  meritsPerTeacherPerDay: z.number().int().min(1).max(100).default(10),
  /** The values the school names, which merits are given for. */
  values: z.array(value).max(8, 'At most 8 values.').default([]),
  /** The school's time zone: days, weeks and sport days follow it. */
  timeZone: z.string().min(1).max(60).refine(validZone, 'Choose a time zone from the list.').default('Australia/Sydney'),
});
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;
export const schoolSettingsPatchSchema = schoolSettingsSchema.partial();

export const houseCupInputSchema = z
  .object({
    name: z.string().trim().min(3, 'Give the cup a name.').max(40, 'At most 40 characters.').refine(clean, 'Pick a different name.'),
    startsOn: day,
    endsOn: day,
  })
  .refine((c) => c.startsOn <= c.endsOn, { message: 'The last day has to be on or after the first.', path: ['endsOn'] })
  .refine((c) => Date.parse(c.endsOn) - Date.parse(c.startsOn) <= 400 * 86_400_000, { message: 'A cup runs for a year at most.', path: ['endsOn'] });
export type HouseCupInput = z.infer<typeof houseCupInputSchema>;

export const NOTICE_AUDIENCES = ['students', 'teachers', 'everyone'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const schoolNoticeSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the notice a title.').max(80, 'At most 80 characters.').refine(clean, 'Reword the title.'),
    body: z.string().trim().max(400, 'At most 400 characters.').refine(clean, 'Reword the notice.').default(''),
    audience: z.enum(NOTICE_AUDIENCES),
    startsAt: iso,
    endsAt: iso,
  })
  .refine((n) => Date.parse(n.startsAt) < Date.parse(n.endsAt), { message: 'The end has to come after the start.', path: ['endsAt'] })
  .refine((n) => Date.parse(n.endsAt) - Date.parse(n.startsAt) <= 92 * 86_400_000, { message: 'A notice shows for three months at most.', path: ['endsAt'] });
export type SchoolNoticeInput = z.infer<typeof schoolNoticeSchema>;

/** A school-wide event with a countdown before it and a themed lobby on the day. */
export const schoolEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the event a name.').max(40, 'At most 40 characters.').refine(clean, 'Pick a different name.'),
    message: z.string().trim().max(120, 'At most 120 characters.').refine(clean, 'Reword the message.').default(''),
    decor: z.enum(EVENT_DECOR),
    hue: z.number().int().min(0).max(359),
    startsAt: iso,
    endsAt: iso,
  })
  .refine((e) => Date.parse(e.startsAt) < Date.parse(e.endsAt), { message: 'The end has to come after the start.', path: ['endsAt'] })
  .refine((e) => Date.parse(e.endsAt) - Date.parse(e.startsAt) <= 14 * 86_400_000, { message: 'A school event lasts two weeks at most.', path: ['endsAt'] });
export type SchoolEventInput = z.infer<typeof schoolEventSchema>;

export const meritInputSchema = z.object({
  studentId: z.string().uuid(),
  value: value,
  note: z.string().trim().max(120, 'At most 120 characters.').refine(clean, 'Reword the note.').default(''),
});

/** Weekdays as numbers: 1 Monday to 5 Friday (weekends have no sport day). */
export const SPORT_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const sportDaysSchema = z
  .array(z.number().int().min(1).max(5))
  .max(5)
  .transform((d) => [...new Set(d)].sort());

export const TOURNAMENT_FORMATS = ['knockout', 'round_robin'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const tournamentInputSchema = z.object({
  name: z.string().trim().min(3, 'Give the tournament a name.').max(50, 'At most 50 characters.').refine(clean, 'Pick a different name.'),
  format: z.enum(TOURNAMENT_FORMATS),
  /** Classes the teacher teaches, or teams they name. */
  entrants: z
    .array(
      z.object({
        name: z.string().trim().min(2, 'Each entrant needs a name.').max(30, 'At most 30 characters.').refine(clean, 'Pick a different name.'),
        classId: z.string().uuid().nullable().default(null),
      }),
    )
    .min(2, 'A tournament needs at least 2 entrants.')
    .max(16, 'At most 16 entrants.'),
});
export type TournamentInput = z.infer<typeof tournamentInputSchema>;

export const classChallengeInputSchema = z
  .object({
    classId: z.string().uuid(),
    /** The other class's join code: its teacher accepts before anything starts. */
    otherCode: z.string().trim().min(4).max(12),
    setId: z.string().uuid(),
    modeId: z.string().min(1).max(60),
    startsAt: iso,
    endsAt: iso,
  })
  .refine((c) => Date.parse(c.startsAt) < Date.parse(c.endsAt), { message: 'The end has to come after the start.', path: ['endsAt'] })
  .refine((c) => Date.parse(c.endsAt) - Date.parse(c.startsAt) <= 14 * 86_400_000, { message: 'A challenge runs for two weeks at most.', path: ['endsAt'] });

/** How the teams of a live game are made on a school's copy: by house, or two classes against each other. */
export const schoolTeamsSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('houses') }),
  z.object({ by: z.literal('classes'), classIds: z.array(z.string().uuid()).length(2) }),
  z.object({ by: z.literal('match'), matchId: z.string().uuid() }),
]);
export type SchoolTeams = z.infer<typeof schoolTeamsSchema>;

/** House colours: the same fill the team colours use, with ink text (passes 4.5:1 at every hue). */
export const houseFill = (hue: number) => `hsl(${hue} 80% 64%)`;
