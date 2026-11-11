import { z } from 'zod';
import { DEFAULT_SCHOOL_DRESS, EMOTE_GLYPHS, schoolDressSchema } from '@ludora/shared';

const theme = z.enum(['system', 'light', 'dark']);
const reducedMotion = z.enum(['system', 'on', 'off']);
const stageBackdrop = z.enum(['floodlights', 'hills', 'harbour', 'aurora', 'rooftops', 'forest', 'plain']);
const textSize = z.enum(['normal', 'large', 'larger']);
const profileVisibility = z.enum(['public', 'friends', 'private']);
const allowFriendRequests = z.enum(['everyone', 'friend_code', 'nobody']);

/** A time zone name the runtime knows (Europe/London), or null for the device's own. */
const timeZone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'That is not a time zone.')
  .nullable();

/**
 * Accessibility and comfort. Every default is how the app behaved before the setting
 * existed. The web keeps the same defaults in web/src/lib/prefs.ts (ACCESS_DEFAULTS).
 */
const accessShape = {
  /** A speaker button reads the question and answers aloud with the browser's own speech. */
  readAloud: z.boolean().default(false),
  /** Read each new question aloud by itself (needs readAloud). */
  readAuto: z.boolean().default(false),
  readRate: z.number().min(0.5).max(2).default(1),
  /** Atkinson Hyperlegible everywhere, headings and numbers included. */
  font: z.enum(['standard', 'easy']).default('standard'),
  letterSpacing: z.enum(['normal', 'wide', 'wider']).default('normal'),
  lineSpacing: z.enum(['normal', 'wide', 'wider']).default('normal'),
  /** The highest contrast level, on top of high contrast. */
  maxContrast: z.boolean().default(false),
  lessTransparency: z.boolean().default(false),
  underlineLinks: z.boolean().default(false),
  strongFocus: z.boolean().default(false),
  /** Answer tiles in a palette checked for colour-vision differences, each with a pattern. */
  tiles: z.enum(['standard', 'safe']).default('standard'),
  /** No reactions, confetti, countdown tick or flashing. */
  calm: z.boolean().default(false),
  timer: z.enum(['both', 'bar', 'number', 'hidden']).default('both'),
  /** Bigger buttons and text on game screens. */
  littleHands: z.boolean().default(false),
  /** A visible cue and caption for sounds that carry meaning. */
  captions: z.boolean().default(false),
  vibrate: z.boolean().default(false),
  wakeLock: z.boolean().default(false),
  dataSaver: z.enum(['auto', 'on', 'off']).default('auto'),
  /** Caps 3D scenes at 30 frames a second. */
  batterySaver: z.boolean().default(false),
  /** Dates and times show in this zone (due dates included); null for the device's. */
  timeZone: timeZone.default(null),
  /** Numbers and dates in British English, or the device's own language. */
  locale: z.enum(['en-GB', 'device']).default('en-GB'),
};
const accessSchema = z.object(accessShape);
const ACCESS_DEFAULTS = accessSchema.parse({});
const accessPatchSchema = z.object(Object.fromEntries(Object.entries(accessShape).map(([k, v]) => [k, v.unwrap().optional()])) as { [K in keyof typeof accessShape]: z.ZodOptional<ReturnType<(typeof accessShape)[K]['unwrap']>> });

export const preferencesSchema = z.object({
  theme: theme.default('system'),
  reducedMotion: reducedMotion.default('system'),
  sound: z.boolean().default(true),
  /** Music on the host's screen and in solo games. Players' phones never play music. */
  music: z.boolean().default(true),
  textSize: textSize.default('normal'),
  highContrast: z.boolean().default(false),
  notifications: z
    .object({
      friendRequests: z.boolean().default(true),
      gameInvites: z.boolean().default(true),
      rewards: z.boolean().default(true),
    })
    .default({ friendRequests: true, gameInvites: true, rewards: true }),
  privacy: z
    .object({
      profileVisibility: profileVisibility.default('public'),
      allowFriendRequests: allowFriendRequests.default('everyone'),
      showOnLeaderboards: z.boolean().default(true),
    })
    .default({ profileVisibility: 'public', allowFriendRequests: 'everyone', showOnLeaderboards: true }),
  /** On a school's copy: the player's year group, blazer and kit, which decide their Glim's uniform. */
  school: z
    .object({
      year: schoolDressSchema.shape.year.default(null),
      blazer: schoolDressSchema.shape.blazer.default('green'),
      kit: schoolDressSchema.shape.kit.default('school'),
    })
    .default(DEFAULT_SCHOOL_DRESS),
  access: accessSchema.default(ACCESS_DEFAULTS),
  /** The reactions on the player's bar in games, in order. Empty: the free set. Only reactions they own are ever used (the room checks). */
  reactionBar: z.array(z.enum(EMOTE_GLYPHS)).max(8).default([]),
  /** The host's big-screen backdrop for the lobby and between questions (web/src/features/room/game/Backdrop.tsx). */
  stageBackdrop: stageBackdrop.default('floodlights'),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * A change to some preferences. No defaults here: a field the request leaves
 * out must stay out, or merging would put the player's other choices (larger
 * text, less motion) back to their defaults.
 */
export const preferencesPatchSchema = z.object({
  theme: theme.optional(),
  reducedMotion: reducedMotion.optional(),
  sound: z.boolean().optional(),
  music: z.boolean().optional(),
  textSize: textSize.optional(),
  highContrast: z.boolean().optional(),
  notifications: z.object({ friendRequests: z.boolean(), gameInvites: z.boolean(), rewards: z.boolean() }).partial().optional(),
  privacy: z.object({ profileVisibility, allowFriendRequests, showOnLeaderboards: z.boolean() }).partial().optional(),
  school: schoolDressSchema.partial().optional(),
  access: accessPatchSchema.optional(),
  reactionBar: z.array(z.enum(EMOTE_GLYPHS)).max(8, 'Choose up to 8 reactions.').optional(),
  stageBackdrop: stageBackdrop.optional(),
});

/** Parse stored preferences, filling anything missing with defaults. Never throws. */
export function readPreferences(raw: unknown): Preferences {
  const r = preferencesSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  // One unreadable accessibility choice must not cost the player every other setting.
  const rest = preferencesSchema.safeParse({ ...(raw as object), access: undefined });
  return rest.success ? rest.data : preferencesSchema.parse({});
}

/** Safer defaults for players under 13: private-ish profile, friend requests by code only. */
export function defaultPreferences(ageBand: string | null): Preferences {
  const p = preferencesSchema.parse({});
  if (ageBand === 'under13') {
    p.privacy.profileVisibility = 'friends';
    p.privacy.allowFriendRequests = 'friend_code';
  }
  return p;
}

/** Only the keys a patch actually sets; an undefined value never overwrites a stored choice. */
const defined = <T extends object>(o: T | undefined): Partial<T> => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;

export function mergePreferences(current: Preferences, patch: z.infer<typeof preferencesPatchSchema>): Preferences {
  const { notifications, privacy, school, access, ...top } = patch;
  return preferencesSchema.parse({
    ...current,
    ...defined(top),
    notifications: { ...current.notifications, ...defined(notifications) },
    privacy: { ...current.privacy, ...defined(privacy) },
    school: { ...current.school, ...defined(school) },
    access: { ...current.access, ...defined(access) },
  });
}
