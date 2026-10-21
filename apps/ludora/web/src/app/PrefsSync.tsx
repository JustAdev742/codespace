import { useEffect } from 'react';
import { useMe } from '../lib/session.ts';
import { applyPreferences, applyTheme, localTheme } from '../lib/prefs.ts';

/** Keeps the page's theme, motion and text-size settings in step with the account (or this browser, when signed out). */
export function PrefsSync() {
  const { data } = useMe();
  const prefs = data?.user?.preferences;
  useEffect(() => {
    if (prefs) applyPreferences(prefs);
    else applyTheme(localTheme());
  }, [prefs]);
  return null;
}
