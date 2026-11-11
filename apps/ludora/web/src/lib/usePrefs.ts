import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api.ts';
import { meKey, useMe, type Me, type Preferences } from './session.ts';
import { ACCESS_DEFAULTS, applyPreferences, currentAccess, devicePrefs, localPrefs, saveLocalPrefs, setDevicePrefs, subscribeAccess, subscribeDevice, type AccessPrefs, type DevicePrefs, type LocalPrefs } from './prefs.ts';

export type PrefPatch = Partial<Omit<Preferences, 'notifications' | 'privacy' | 'school' | 'access'>> & {
  notifications?: Partial<Preferences['notifications']>;
  privacy?: Partial<Preferences['privacy']>;
  school?: Partial<NonNullable<Preferences['school']>>;
  access?: Partial<AccessPrefs>;
};

let localVersion = 0;
const localListeners = new Set<() => void>();
const subscribeLocal = (l: () => void) => {
  localListeners.add(l);
  return () => localListeners.delete(l);
};
let localCache: { v: number; p: LocalPrefs } | null = null;
const getLocal = () => {
  if (!localCache || localCache.v !== localVersion) localCache = { v: localVersion, p: localPrefs() };
  return localCache.p;
};

/**
 * The player's settings and a way to change them: saved to the account when signed in, to this
 * device when not (students often join a game with a code and no account). Changes apply at once.
 */
export function usePrefs() {
  const me = useMe();
  const qc = useQueryClient();
  const user = me.data?.user ?? null;
  const local = useSyncExternalStore(subscribeLocal, getLocal, getLocal);
  const prefs = user ? { ...user.preferences, access: { ...ACCESS_DEFAULTS, ...user.preferences.access } } : null;
  const effective = prefs ?? local;
  const save = (patch: PrefPatch) => {
    if (user) {
      const merged = {
        ...user.preferences,
        ...patch,
        notifications: { ...user.preferences.notifications, ...patch.notifications },
        privacy: { ...user.preferences.privacy, ...patch.privacy },
        ...(user.preferences.school || patch.school ? { school: { ...user.preferences.school, ...patch.school } } : {}),
        access: { ...ACCESS_DEFAULTS, ...user.preferences.access, ...patch.access },
      } as Preferences;
      applyPreferences(merged);
      // Shown at once; the server's answer replaces it.
      qc.setQueryData<Me>(meKey, (old) => (old?.user ? { ...old, user: { ...old.user, preferences: merged } } : old));
      api
        .patch<{ preferences: Preferences }>('/api/me/preferences', patch)
        .then((r) => qc.setQueryData<Me>(meKey, (old) => (old?.user ? { ...old, user: { ...old.user, preferences: r.preferences } } : old)))
        .catch((err: unknown) => {
          toast.error(err instanceof ApiError ? err.message : 'Could not save that setting. Check your connection and try again.');
          void qc.invalidateQueries({ queryKey: meKey });
        });
      return;
    }
    const { notifications: _n, privacy: _p, school: _s, ...rest } = patch;
    const next = saveLocalPrefs(rest);
    localVersion++;
    localListeners.forEach((l) => l());
    applyPreferences(next);
  };
  return { prefs: effective, access: effective.access, save, signedIn: Boolean(user), loading: me.isLoading };
}

/** Tell usePrefs that the signed-out settings changed elsewhere (they were reset). */
export function localPrefsChanged() {
  localVersion++;
  localListeners.forEach((l) => l());
}

/** The accessibility settings in force now, for game screens. Works signed in or out. */
export function useAccess(): AccessPrefs {
  return useSyncExternalStore(subscribeAccess, currentAccess, currentAccess);
}

export function useDevicePrefs(): [DevicePrefs, (patch: Partial<DevicePrefs>) => void] {
  return [useSyncExternalStore(subscribeDevice, devicePrefs, devicePrefs), setDevicePrefs];
}
