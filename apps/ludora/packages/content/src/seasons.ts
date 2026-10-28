/*
 * Ludora's calendar: the season and any celebration on a given day, worked
 * out in Sydney time (where Ludora's first schools are). The site, the game
 * screens and the shop dress themselves from it with no one switching
 * anything on. Southern Hemisphere seasons: summer is December to February.
 *
 * Celebrations are kept school friendly and inclusive. Dates that move
 * (Easter, Lunar New Year, Book Week, Science Week) are worked out by rule;
 * where a real event's dates are set by someone else each year, the rule
 * follows the pattern of recent years and staff can override the window.
 *
 * Browser-safe and small: imported by the web app through
 * `@ludora/content/seasons`.
 */

export type Decor = 'bunting' | 'lights' | 'fireworks' | 'lanterns' | 'confetti' | 'eggs' | 'books' | 'stars' | 'leaves' | 'blossoms' | 'sun' | 'rain' | 'bats' | 'snow';

export interface SeasonTheme {
  /** Main and accent hue, in degrees. */
  hue: number;
  accentHue: number;
  /** Small decorations scenes and pages may add. The first is the main one. */
  decor: Decor[];
}

export interface SeasonDef {
  id: string;
  name: string;
  /** One line for banners. */
  tagline: string;
  theme: SeasonTheme;
}

export interface CelebrationDef extends SeasonDef {
  /** First and last day (inclusive) in the given year, as Sydney calendar dates. */
  window(year: number): { start: CalendarDate; end: CalendarDate };
  /** Higher wins when two overlap. */
  priority: number;
}

export interface CalendarDate {
  y: number;
  /** 1 to 12. */
  m: number;
  d: number;
}

export const TIME_ZONE = 'Australia/Sydney';

/** The calendar date in Sydney at an instant. */
export function sydneyDate(at: Date, timeZone = TIME_ZONE): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: n('year'), m: n('month'), d: n('day') };
}

const key = (c: CalendarDate) => c.y * 10000 + c.m * 100 + c.d;

function addDays(c: CalendarDate, days: number): CalendarDate {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Day of the week, 0 Sunday to 6 Saturday. */
function weekday(c: CalendarDate): number {
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
}

/** The nth (1-based) given weekday of a month. */
function nthWeekday(y: number, m: number, wd: number, n: number): CalendarDate {
  const first = { y, m, d: 1 };
  const offset = (wd - weekday(first) + 7) % 7;
  return { y, m, d: 1 + offset + (n - 1) * 7 };
}

/** Easter Sunday (Gregorian), by the anonymous algorithm. */
export function easterSunday(y: number): CalendarDate {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y, m: month, d: day };
}

/** The first day of the lunar new year, from published tables. Years outside the table have no Lunar New Year window. */
export const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
  2031: [1, 23],
  2032: [2, 11],
  2033: [1, 31],
  2034: [2, 19],
  2035: [2, 8],
};

/* --------------------------------- seasons --------------------------------- */

export const SEASONS: Record<'summer' | 'autumn' | 'winter' | 'spring', SeasonDef & { months: number[] }> = {
  summer: { id: 'summer', name: 'Summer', tagline: 'Long days, hot sand and ice blocks.', months: [12, 1, 2], theme: { hue: 44, accentHue: 190, decor: ['sun'] } },
  autumn: { id: 'autumn', name: 'Autumn', tagline: 'Crunchy leaves and cooler afternoons.', months: [3, 4, 5], theme: { hue: 24, accentHue: 44, decor: ['leaves'] } },
  winter: { id: 'winter', name: 'Winter', tagline: 'Beanies on, hot chocolate out.', months: [6, 7, 8], theme: { hue: 205, accentHue: 260, decor: ['rain'] } },
  spring: { id: 'spring', name: 'Spring', tagline: 'Blossoms everywhere and the jacarandas on their way.', months: [9, 10, 11], theme: { hue: 290, accentHue: 120, decor: ['blossoms'] } },
};

export type SeasonId = keyof typeof SEASONS;

export function seasonOf(c: CalendarDate): SeasonDef & { months: number[] } {
  for (const s of Object.values(SEASONS)) if (s.months.includes(c.m)) return s;
  return SEASONS.summer;
}

/* ------------------------------- celebrations ------------------------------ */

const fixed = (sm: number, sd: number, em: number, ed: number) => (y: number) => ({ start: { y, m: sm, d: sd }, end: { y, m: em, d: ed } });

export const CELEBRATIONS: readonly CelebrationDef[] = [
  {
    id: 'new-year',
    name: 'New Year',
    tagline: 'Fireworks over the harbour and a brand new year of games.',
    // New Year's Eve and New Year's Day; the window that starts in December is found from the year before.
    window: fixed(12, 31, 12, 31),
    priority: 30,
    theme: { hue: 270, accentHue: 44, decor: ['fireworks', 'stars'] },
  },
  {
    id: 'new-year-day',
    name: 'New Year',
    tagline: 'Fireworks over the harbour and a brand new year of games.',
    window: fixed(1, 1, 1, 1),
    priority: 30,
    theme: { hue: 270, accentHue: 44, decor: ['fireworks', 'stars'] },
  },
  {
    id: 'australia-day',
    name: 'Australia Day',
    tagline: 'A long weekend of picnics, beach cricket and the place we all share.',
    window: fixed(1, 24, 1, 27),
    // Above Lunar New Year, which sometimes lands on the same days (2028).
    priority: 26,
    theme: { hue: 140, accentHue: 48, decor: ['bunting', 'sun'] },
  },
  {
    id: 'lunar-new-year',
    name: 'Lunar New Year',
    tagline: 'Red lanterns, dragon dances and a fresh start.',
    // Month 13 marks a year outside the table: no window (see windowOf).
    window: (y) => {
      const d = LUNAR_NEW_YEAR[y];
      if (!d) return { start: { y, m: 13, d: 1 }, end: { y, m: 13, d: 1 } };
      const start = { y, m: d[0], d: d[1] };
      return { start: addDays(start, -1), end: addDays(start, 6) };
    },
    priority: 25,
    theme: { hue: 356, accentHue: 44, decor: ['lanterns', 'confetti'] },
  },
  {
    id: 'harmony-week',
    name: 'Harmony Week',
    tagline: 'Everyone belongs. Wear something orange!',
    // The week around Harmony Day, 21 March.
    window: fixed(3, 15, 3, 21),
    priority: 20,
    theme: { hue: 28, accentHue: 200, decor: ['confetti', 'bunting'] },
  },
  {
    id: 'easter',
    name: 'Easter',
    tagline: 'Egg hunts, hot cross buns and a long weekend.',
    // Good Friday to Easter Monday, with the Wednesday before for the run-up at school.
    window: (y) => {
      const sunday = easterSunday(y);
      return { start: addDays(sunday, -4), end: addDays(sunday, 1) };
    },
    priority: 25,
    theme: { hue: 300, accentHue: 160, decor: ['eggs', 'blossoms'] },
  },
  {
    id: 'science-week',
    name: 'Science Week',
    tagline: 'Experiments, stars and big questions.',
    // Nine days from the second Saturday of August, as in recent years.
    window: (y) => {
      const start = nthWeekday(y, 8, 6, 2);
      return { start, end: addDays(start, 8) };
    },
    priority: 15,
    theme: { hue: 200, accentHue: 300, decor: ['stars'] },
  },
  {
    id: 'book-week',
    name: 'Book Week',
    tagline: 'Dress up as your favourite character and read something new.',
    // A week from the third Saturday of August, as in recent years.
    window: (y) => {
      const start = nthWeekday(y, 8, 6, 3);
      return { start, end: addDays(start, 6) };
    },
    priority: 20,
    theme: { hue: 32, accentHue: 210, decor: ['books'] },
  },
  {
    id: 'spooky-week',
    name: 'Spooky Week',
    tagline: 'Glowing lanterns, friendly ghosts and a few surprises.',
    window: fixed(10, 25, 10, 31),
    priority: 20,
    theme: { hue: 28, accentHue: 270, decor: ['lanterns', 'bats'] },
  },
  {
    id: 'summer-christmas',
    name: 'Summer Christmas',
    tagline: 'Fairy lights, beach cricket and pavlova in the sun.',
    window: fixed(12, 1, 12, 26),
    priority: 20,
    theme: { hue: 352, accentHue: 140, decor: ['lights', 'bunting'] },
  },
];

export interface ActiveSeason {
  date: CalendarDate;
  season: SeasonDef;
  celebration: CelebrationDef | null;
  /** The theme to dress things in: the celebration's when there is one, otherwise the season's. */
  theme: SeasonTheme;
}

/**
 * Staff changes to the calendar, keyed `<celebration id>:<year>`: a new window
 * for that year, or null to leave the celebration out that year.
 */
export type SeasonOverrides = Record<string, { start: CalendarDate; end: CalendarDate } | null>;

const overrideKey = (id: string, year: number) => `${id}:${year}`;

/** A celebration's window in a year, after staff changes. Null when it is not on that year. */
export function windowOf(c: CelebrationDef, year: number, overrides: SeasonOverrides = {}): { start: CalendarDate; end: CalendarDate } | null {
  const k = overrideKey(c.id, year);
  const w = k in overrides ? overrides[k]! : c.window(year);
  return w && w.start.m <= 12 ? w : null;
}

/** The season and celebration at an instant, in Sydney time. */
export function activeSeason(at: Date = new Date(), overrides: SeasonOverrides = {}): ActiveSeason {
  const date = sydneyDate(at);
  const season = seasonOf(date);
  const today = key(date);
  let best: CelebrationDef | null = null;
  for (const c of CELEBRATIONS) {
    const w = windowOf(c, date.y, overrides);
    if (w && today >= key(w.start) && today <= key(w.end) && (!best || c.priority > best.priority)) best = c;
  }
  return { date, season, celebration: best, theme: best?.theme ?? season.theme };
}

/** The next celebration after a date (for "coming soon"), looking up to a year ahead. */
export function nextCelebration(at: Date = new Date(), overrides: SeasonOverrides = {}): { celebration: CelebrationDef; start: CalendarDate } | null {
  const date = sydneyDate(at);
  const today = key(date);
  let best: { celebration: CelebrationDef; start: CalendarDate } | null = null;
  for (const y of [date.y, date.y + 1]) {
    for (const c of CELEBRATIONS) {
      const w = windowOf(c, y, overrides);
      if (w && key(w.start) > today && (!best || key(w.start) < key(best.start))) best = { celebration: c, start: w.start };
    }
  }
  return best;
}

/** What the server sends and the site dresses itself from. Plain data, the same shape whether worked out by the server or (in the demo) the browser. */
export interface SeasonView {
  date: CalendarDate;
  season: { id: string; name: string; tagline: string };
  celebration: { id: string; name: string; tagline: string; start: CalendarDate; end: CalendarDate } | null;
  theme: SeasonTheme;
  next: { id: string; name: string; start: CalendarDate } | null;
}

export function seasonView(at: Date = new Date(), overrides: SeasonOverrides = {}): SeasonView {
  const a = activeSeason(at, overrides);
  const n = nextCelebration(at, overrides);
  const w = a.celebration ? windowOf(a.celebration, a.date.y, overrides)! : null;
  return {
    date: a.date,
    season: { id: a.season.id, name: a.season.name, tagline: a.season.tagline },
    celebration: a.celebration && w ? { id: a.celebration.id, name: a.celebration.name, tagline: a.celebration.tagline, start: w.start, end: w.end } : null,
    theme: a.theme,
    next: n ? { id: n.celebration.id, name: n.celebration.name, start: n.start } : null,
  };
}

/** `YYYY-MM-DD`, for forms and keys. */
export const isoDay = (c: CalendarDate) => `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;

export function parseDay(s: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const back = addDays(c, 0);
  return key(back) === key(c) ? c : null;
}

/** Midnight in Sydney at the start of a calendar date, as an instant. */
export function sydneyMidnight(c: CalendarDate): Date {
  // Sydney is UTC+10 or +11; find the instant whose Sydney date is c at 00:00.
  for (const offset of [11, 10]) {
    const guess = new Date(Date.UTC(c.y, c.m - 1, c.d, 0 - offset, 0, 0));
    const back = sydneyDate(guess);
    const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(guess));
    if (key(back) === key(c) && hour === 0) return guess;
  }
  return new Date(Date.UTC(c.y, c.m - 1, c.d, -10));
}
