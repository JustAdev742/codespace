import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Megaphone } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { Stage } from '../../ui/Stage.tsx';
import { SeasonGarland } from '../season/SeasonGarland.tsx';
import type { Decor, SeasonTheme } from '@ludora/content/seasons';
import { HouseCrest } from './emblems.tsx';
import { HouseWelcome } from './Welcome.tsx';
import { schoolKeys, useNotices, useSchoolEvent, useSchoolMe, type SchoolEvent } from './schoolData.ts';

/*
 * The school on a player's home page: the countdown to the next school event (or "on today"), the
 * notices for them, their house, and the one-time welcome to it. Shows nothing when the school has
 * none of these.
 */

function EventBanner({ e }: { e: SchoolEvent }) {
  const theme: SeasonTheme = { hue: e.hue, accentHue: (e.hue + 40) % 360, decor: [e.decor as Decor] };
  const days = Math.max(0, Math.ceil((Date.parse(e.startsAt) - Date.now()) / 86_400_000));
  return (
    <Stage as="section" className="relative overflow-hidden rounded-[var(--radius-l)] px-4 pt-[64px] pb-4 sm:px-6">
      <SeasonGarland theme={theme} />
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-2">{e.on ? 'On today at school' : 'Coming up at school'}</p>
          <h2 className="font-display text-[2rem] leading-tight font-bold text-balance">{e.title}</h2>
          {e.message ? <p className="text-text-2">{e.message}</p> : null}
        </div>
        {e.on ? (
          <span className="plate plate-gold text-xl">
            <span>On now</span>
          </span>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="sr-only">
              {days} {days === 1 ? 'day' : 'days'} to go
            </span>
            <span className="font-display text-6xl leading-none font-extrabold italic tabular" aria-hidden>
              {days}
            </span>
            <span className="font-semibold text-text-2" aria-hidden>
              {days === 1 ? 'day to go' : 'days to go'}
            </span>
          </p>
        )}
      </div>
    </Stage>
  );
}

export function SchoolStrip() {
  const qc = useQueryClient();
  const me = useSchoolMe();
  const event = useSchoolEvent();
  const notices = useNotices();
  const e = event.data?.event ?? null;
  const list = notices.data?.notices ?? [];
  const house = me.data?.house ?? null;
  if (!e && !list.length && !house) return null;
  return (
    <div className="flex flex-col gap-4">
      {me.data?.welcome && house ? <HouseWelcome house={house} onDone={() => void api.post('/api/school/me/welcomed').then(() => qc.invalidateQueries({ queryKey: schoolKeys.me }))} /> : null}
      {e ? <EventBanner e={e} /> : null}
      {list.length || house ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4 sm:flex-row sm:items-start">
          {house ? (
            <Link to="/school" className="press-soft flex min-h-11 shrink-0 items-center gap-3 rounded-[var(--radius-m)] pr-2 text-text sm:w-56">
              <HouseCrest house={house} size={44} />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-text-3">Your house</span>
                <span className="block truncate font-display text-xl font-bold">{house.name}</span>
              </span>
              <ChevronRight className="ml-auto size-4 text-text-3" aria-hidden />
            </Link>
          ) : null}
          {list.length ? (
            <section aria-labelledby="school-notices" className="min-w-0 flex-1">
              <h2 id="school-notices" className="flex items-center gap-2 font-display text-xl font-bold text-text">
                <Megaphone className="size-5 text-lantern" aria-hidden /> School notices
              </h2>
              <ul className="mt-1 flex flex-col gap-1.5">
                {list.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <p className="font-semibold text-text">{n.title}</p>
                    {n.body ? <p className="line-clamp-2 text-sm text-text-2">{n.body}</p> : null}
                  </li>
                ))}
              </ul>
              {list.length > 3 ? (
                <Link to="/school?tab=notices" className="mt-1 inline-block text-sm font-semibold text-link underline underline-offset-2">
                  All {list.length} notices
                </Link>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
