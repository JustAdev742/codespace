import { z } from 'zod';

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  reducedMotion: z.enum(['system', 'on', 'off']).default('system'),
  sound: z.boolean().default(true),
  textSize: z.enum(['normal', 'large', 'larger']).default('normal'),
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
      profileVisibility: z.enum(['public', 'friends', 'private']).default('public'),
      allowFriendRequests: z.enum(['everyone', 'friend_code', 'nobody']).default('everyone'),
      showOnLeaderboards: z.boolean().default(true),
    })
    .default({ profileVisibility: 'public', allowFriendRequests: 'everyone', showOnLeaderboards: true }),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const preferencesPatchSchema = z.object({
  theme: preferencesSchema.shape.theme.optional(),
  reducedMotion: preferencesSchema.shape.reducedMotion.optional(),
  sound: z.boolean().optional(),
  textSize: preferencesSchema.shape.textSize.optional(),
  highContrast: z.boolean().optional(),
  notifications: z.object({ friendRequests: z.boolean(), gameInvites: z.boolean(), rewards: z.boolean() }).partial().optional(),
  privacy: z
    .object({
      profileVisibility: z.enum(['public', 'friends', 'private']),
      allowFriendRequests: z.enum(['everyone', 'friend_code', 'nobody']),
      showOnLeaderboards: z.boolean(),
    })
    .partial()
    .optional(),
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

export function mergePreferences(current: Preferences, patch: z.infer<typeof preferencesPatchSchema>): Preferences {
  return preferencesSchema.parse({
    ...current,
    ...patch,
    notifications: { ...current.notifications, ...patch.notifications },
    privacy: { ...current.privacy, ...patch.privacy },
  });
}
