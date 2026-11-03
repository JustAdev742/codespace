import { useEffect } from 'react';
import { uniformForDress } from '@ludora/shared';
import { deviceDress, setViewerUniform } from '../lib/school.ts';
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
  // The uniform this viewer's own Glims wear: their account's year group, or this device's for a guest.
  const school = prefs?.school;
  useEffect(() => {
    setViewerUniform(uniformForDress(school?.year != null ? school : deviceDress()));
  }, [school]);
  return null;
}
