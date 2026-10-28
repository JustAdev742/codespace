import { useQuery } from '@tanstack/react-query';
import type { Decor, SeasonTheme } from '@ludora/content/seasons';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useSeason } from '../../lib/season.ts';
import { SeasonGarland } from './SeasonGarland.tsx';

/*
 * The season on a page hero: the garland across the top of the stage and one
 * line saying what is on. Both come from the server's calendar, so they turn
 * over by themselves at midnight in Sydney.
 */

interface MyEvent {
  id: string;
  title: string;
  message: string;
  decor: string;
  hue: number;
  endsAt: string;
  className: string;
  schoolName: string | null;
}

/** A school event on right now in one of your classes. It dresses the home page instead of the season while it is on. */
function useSchoolEvent(): MyEvent | null {
  const me = useMe();
  const signedIn = Boolean(me.data?.user && !me.data.user.isGuest);
  const q = useQuery({ queryKey: ['me-events'], queryFn: () => api.get<{ events: MyEvent[] }>('/api/me/events'), enabled: signedIn, staleTime: 5 * 60_000 });
  return signedIn ? (q.data?.events[0] ?? null) : null;
}

const eventTheme = (e: MyEvent): SeasonTheme => ({ hue: e.hue, accentHue: (e.hue + 40) % 360, decor: [e.decor as Decor] });

/** Decorations across the top of a stage. Put it first inside a Stage; give the content `relative z-10`. */
export function SeasonDecor() {
  const theme = useSeason().data?.theme;
  const event = useSchoolEvent();
  const t = event ? eventTheme(event) : theme;
  return t ? <SeasonGarland theme={t} /> : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What is on: the celebration if there is one, otherwise the season, and what comes next. */
export function SeasonLine({ className = '' }: { className?: string }) {
  const view = useSeason().data;
  const event = useSchoolEvent();
  if (event) {
    return (
      <p className={`text-sm text-text-2 ${className}`}>
        <span className="font-bold" style={{ color: `hsl(${event.hue} 90% 72%)` }}>
          {event.schoolName ?? event.className}: {event.title}.
        </span>{' '}
        {event.message}
      </p>
    );
  }
  if (!view) return null;
  const now = view.celebration ?? view.season;
  const accent = `hsl(${view.theme.hue} 90% 72%)`;
  return (
    <p className={`text-sm text-text-2 ${className}`}>
      <span className="font-bold" style={{ color: accent }}>
        {now.name}.
      </span>{' '}
      {now.tagline}
      {!view.celebration && view.next ? (
        <span className="text-text-3">
          {' '}
          Next up: {view.next.name}, {view.next.start.d} {MONTHS[view.next.start.m - 1]}.
        </span>
      ) : null}
    </p>
  );
}
