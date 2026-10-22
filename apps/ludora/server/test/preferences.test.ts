import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { mergePreferences, preferencesPatchSchema, readPreferences } from '../src/modules/users/preferences.ts';

/*
 * Settings change one preference at a time. A change must never put the
 * others back to their defaults: a player who chose larger text or less
 * motion keeps it when they switch sound off.
 */

describe('preference changes', () => {
  it('a patch holds only what was sent', () => {
    expect(preferencesPatchSchema.parse({ sound: false })).toEqual({ sound: false });
    expect(preferencesPatchSchema.parse({ privacy: { showOnLeaderboards: false } })).toEqual({ privacy: { showOnLeaderboards: false } });
  });

  it('turns music on for accounts that never chose, including ones saved before it existed', () => {
    expect(readPreferences({ sound: false }).music).toBe(true);
    expect(readPreferences({ music: false }).music).toBe(false);
  });

  it('merging one change keeps every other choice', () => {
    const chosen = readPreferences({ theme: 'dark', textSize: 'larger', reducedMotion: 'on', highContrast: true, privacy: { profileVisibility: 'private' } });
    const merged = mergePreferences(chosen, preferencesPatchSchema.parse({ sound: false }));
    expect(merged).toEqual({ ...chosen, sound: false });
  });
});

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('PATCH /api/me/preferences', () => {
  it('changes one setting at a time and leaves the rest alone', async () => {
    const { client } = await registered(t.app);
    for (const patch of [{ theme: 'dark' }, { textSize: 'larger' }, { reducedMotion: 'on' }, { highContrast: true }, { privacy: { allowFriendRequests: 'nobody' } }, { sound: false }, { music: false }, { notifications: { rewards: false } }]) {
      expect((await client.patch('/api/me/preferences', patch)).status, JSON.stringify(patch)).toBe(200);
    }
    const prefs = (await client.get('/api/auth/me')).body.user.preferences;
    expect(prefs).toMatchObject({
      theme: 'dark',
      textSize: 'larger',
      reducedMotion: 'on',
      highContrast: true,
      sound: false,
      music: false,
      privacy: { allowFriendRequests: 'nobody', profileVisibility: 'public', showOnLeaderboards: true },
      notifications: { rewards: false, friendRequests: true, gameInvites: true },
    });
    expect((await client.patch('/api/me/preferences', { theme: 'neon' })).status).toBe(400);
  });
});
