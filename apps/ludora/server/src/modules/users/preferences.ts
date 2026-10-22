import { z } from 'zod';

const theme = z.enum(['system', 'light', 'dark']);
const reducedMotion = z.enum(['system', 'on', 'off']);
const textSize = z.enum(['normal', 'large', 'larger']);
const profileVisibility = z.enum(['public', 'friends', 'private']);
const allowFriendRequests = z.enum(['everyone', 'friend_code', 'nobody']);

export const preferencesSchema = z.object({
  theme: theme.default('system'),
  reducedMotion: reducedMotion.default('system'),
  sound: z.boolean().default(true),
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
  textSize: textSize.optional(),
  highContrast: z.boolean().optional(),
  notifications: z.object({ friendRequests: z.boolean(), gameInvites: z.boolean(), rewards: z.boolean() }).partial().optional(),
  privacy: z.object({ profileVisibility, allowFriendRequests, showOnLeaderboards: z.boolean() }).partial().optional(),
});

/** Parse stored preferences, filling anything missing with defaults. Never throws. */
export function readPreferences(raw: unknown): Preferences {
  const r = preferencesSchema.safeParse(raw ?? {});
  return r.success ? r.data : preferencesSchema.parse({});
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
  const { notifications, privacy, ...top } = patch;
  return preferencesSchema.parse({
    ...current,
    ...defined(top),
    notifications: { ...current.notifications, ...defined(notifications) },
    privacy: { ...current.privacy, ...defined(privacy) },
  });
}
