import { useEffect } from 'react';
import { uniformForDress } from '@ludora/shared';
import { useQuery } from '@tanstack/react-query';
import { deviceDress, schoolLook, setViewerUniform } from '../lib/school.ts';
import { api } from '../lib/api.ts';
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
  // On a sport day (the player's own timetable, or their class's) the server says so, and the kit is sport.
  const signedIn = Boolean(data?.user && !data.user.isGuest);
  const sport = useQuery({ queryKey: ['school', 'me'], queryFn: () => api.get<{ sportToday: boolean }>('/api/school/me'), enabled: signedIn && schoolLook() !== null, staleTime: 60_000 });
  const sportToday = Boolean(sport.data?.sportToday);
  useEffect(() => {
    const dress = school?.year != null ? school : deviceDress();
    setViewerUniform(uniformForDress(dress && sportToday ? { ...dress, kit: 'sport' } : dress));
  }, [school, sportToday]);
  return null;
}
