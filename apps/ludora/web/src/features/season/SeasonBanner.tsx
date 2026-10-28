import { useSeason } from '../../lib/season.ts';
import { SeasonGarland } from './SeasonGarland.tsx';

/*
 * The season on a page hero: the garland across the top of the stage and one
 * line saying what is on. Both come from the server's calendar, so they turn
 * over by themselves at midnight in Sydney.
 */

/** Decorations across the top of a stage. Put it first inside a Stage; give the content `relative z-10`. */
export function SeasonDecor() {
  const theme = useSeason().data?.theme;
  return theme ? <SeasonGarland theme={theme} /> : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What is on: the celebration if there is one, otherwise the season, and what comes next. */
export function SeasonLine({ className = '' }: { className?: string }) {
  const view = useSeason().data;
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
