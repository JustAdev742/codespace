import { useNow } from '../../../lib/useNow.ts';
import { plural } from '../../../lib/format.ts';
import { useAnnounce } from './announce.tsx';
import { useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';

/**
 * Time left for a question, from the game clock: a slim bar that empties and the seconds on a solid disc.
 * The last stretch (five seconds, or a quarter of a short timer) turns coral and is announced once through the game announcer.
 * `size="lg"` is the projector version: a thicker bar and a big number someone at the back of the room can read.
 */
export function TimerBar({ deadline, start, gameNow, paused = false, tone = 'amber', size = 'md' }: { deadline: number | null; start: number; gameNow: () => number; paused?: boolean; tone?: 'amber' | 'violet'; size?: 'md' | 'lg' }) {
  useNow(100, deadline !== null && !paused);
  const total = Math.max(1, (deadline ?? start) - start);
  const left = deadline === null ? 0 : Math.max(0, deadline - gameNow());
  const pct = (left / total) * 100;
  const secs = Math.ceil(left / 1000);
  const warnAt = Math.max(1, Math.min(5, Math.ceil(total / 4000)));
  const urgent = deadline !== null && secs <= warnAt && secs > 0;
  // Said once per question as the last stretch starts; the number itself stays quiet.
  useAnnounce(urgent && !paused ? `${plural(warnAt, 'second')} left.` : null, `${deadline}|${urgent && !paused}`);
  // The clock ticks through the last stretch on the shared screen (the projector, or a solo game).
  useSfx(secs === 1 ? 'tickFinal' : 'tick', `${deadline}|${secs}`, useSharedSounds() && urgent && !paused);
  if (deadline === null) return null;
  const big = size === 'lg';
  const fill = urgent ? 'bg-ember' : tone === 'violet' ? 'bg-dusk' : 'bg-lantern';
  return (
    <div className={`flex items-center ${big ? 'gap-4' : 'gap-3'}`} role="timer" aria-label={`${plural(secs, 'second')} left`}>
      <div className={`relative flex-1 overflow-hidden rounded-full bg-white/[0.12] ${big ? 'h-[clamp(0.9rem,1.8vh,1.35rem)]' : 'h-3'}`}>
        {/* Slides rather than resizes, so it stays smooth on slow classroom laptops. */}
        <div className={`absolute inset-0 rounded-full transition-transform duration-100 ease-linear ${fill}`} style={{ transform: `translateX(${pct - 100}%)` }} />
      </div>
      <span className={`grid shrink-0 place-items-center rounded-full font-display font-extrabold text-on-accent tabular ${fill} ${big ? 'size-[clamp(4rem,7vh,5.5rem)] text-[clamp(2.25rem,4.2vh,3.4rem)]' : 'size-12 text-[1.6rem]'}`}>{secs}</span>
    </div>
  );
}

export function Countdown({ until, gameNow, label }: { until: number | null; gameNow: () => number; label?: string }) {
  useNow(250, until !== null);
  if (until === null) return null;
  const secs = Math.max(0, Math.ceil((until - gameNow()) / 1000));
  const m = Math.floor(secs / 60);
  return (
    <span className="font-display font-bold tabular" aria-label={label ? `${label}: ${secs} seconds` : undefined}>
      {m}:{String(secs % 60).padStart(2, '0')}
    </span>
  );
}
