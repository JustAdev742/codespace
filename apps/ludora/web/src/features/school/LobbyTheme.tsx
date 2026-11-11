import type { Decor, SeasonTheme } from '@ludora/content/seasons';
import { SeasonGarland } from '../season/SeasonGarland.tsx';
import { useSchoolEvent } from './schoolData.ts';

/*
 * On the day of a school event, the host's lobby wears it: the event's decorations hung across the
 * top of the game's title and its name. Nothing on other days. Only the host's big screen asks.
 */
export function SchoolLobbyTheme() {
  const q = useSchoolEvent();
  const e = q.data?.event;
  if (!e?.on) return null;
  const theme: SeasonTheme = { hue: e.hue, accentHue: (e.hue + 40) % 360, decor: [e.decor as Decor] };
  return (
    <div className="relative w-full overflow-hidden rounded-[var(--radius-l)] pt-[56px] pb-2">
      <SeasonGarland theme={theme} />
      <p className="relative z-10 text-[clamp(1rem,1.3vw,1.4rem)] font-semibold text-text-2">
        Today at school: <span className="font-display text-[1.3em] font-bold text-text">{e.title}</span>
      </p>
    </div>
  );
}
