import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api.ts';
import { useMe } from '../lib/session.ts';
import { applyPreferences, localPrefs } from '../lib/prefs.ts';

/*
 * "This is a shared device" (sign-in): the server gives the session a browser-session cookie and
 * ends it after 30 minutes without use. Here, the tab adds two things the server cannot see:
 * signing out when the tab that signed in has been closed (a new visit finds the mark in this
 * device's storage but not in the tab's), and after 20 minutes with no taps or keys.
 */

const DEVICE_MARK = 'ludora.shared';
const TAB_MARK = 'ludora.sharedTab';
export const SHARED_IDLE_MS = 20 * 60_000;

function get(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function set(store: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* private mode: the server's limits still apply */
  }
}

/** Called after signing in with "This is a shared device" ticked. */
export function markSharedDevice(on: boolean) {
  set(localStorage, DEVICE_MARK, on ? '1' : null);
  set(sessionStorage, TAB_MARK, on ? '1' : null);
}

export function SharedDevice() {
  const me = useMe();
  const qc = useQueryClient();
  const signedIn = Boolean(me.data?.user);
  useEffect(() => {
    if (me.isLoading) return;
    const shared = get(localStorage, DEVICE_MARK) === '1';
    if (!shared) return;
    const signOut = async (why: string | null) => {
      markSharedDevice(false);
      // The next person on this device starts with the device's own look, not the last player's.
      applyPreferences(localPrefs());
      await api.post('/api/auth/logout').catch(() => {});
      await qc.invalidateQueries();
      if (why) toast.info(why);
    };
    if (!signedIn) {
      markSharedDevice(false);
      return;
    }
    // A new visit: the tab that signed in was closed.
    if (get(sessionStorage, TAB_MARK) !== '1') {
      void signOut('You were signed out because this is a shared device. Sign in again to carry on.');
      return;
    }
    let last = Date.now();
    const seen = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, seen, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      if (Date.now() - last > SHARED_IDLE_MS) void signOut('Signed out after 20 minutes without activity, because this is a shared device.');
    }, 30_000);
    return () => {
      for (const e of events) window.removeEventListener(e, seen, { capture: true });
      window.clearInterval(timer);
    };
  }, [signedIn, me.isLoading, qc]);
  return null;
}
