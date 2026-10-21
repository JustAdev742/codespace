import { useNow } from '../../../lib/useNow.ts';

/**
 * Time left for a question, from the game clock. The last stretch (five seconds, or a quarter of a short timer) turns coral and is announced once.
 * `size="lg"` is the projector version: a thick bar and a big number someone at the back of the room can read.
 */
export function TimerBar({ deadline, start, gameNow, paused = false, tone = 'amber', size = 'md' }: { deadline: number | null; start: number; gameNow: () => number; paused?: boolean; tone?: 'amber' | 'violet'; size?: 'md' | 'lg' }) {
  useNow(100, deadline !== null && !paused);
  if (deadline === null) return null;
  const now = gameNow();
  const total = Math.max(1, deadline - start);
  const left = Math.max(0, deadline - now);
  const pct = (left / total) * 100;
  const secs = Math.ceil(left / 1000);
  const warnAt = Math.max(1, Math.min(5, Math.ceil(total / 4000)));
  const urgent = secs <= warnAt;
  const big = size === 'lg';
  const fill = urgent ? 'bg-ember' : tone === 'violet' ? 'bg-dusk' : 'bg-lantern';
  return (
    <div className={`flex items-center ${big ? 'gap-4' : 'gap-3'}`} role="timer" aria-label={`${secs} seconds left`}>
      <div className={`relative flex-1 overflow-hidden rounded-full border-ink bg-sunken ${big ? 'h-[clamp(1.25rem,2.2vh,1.75rem)] border-[3px]' : 'h-4 border-2'}`}>
        {/* Slides rather than resizes, so it stays smooth on slow classroom laptops. */}
        <div className={`absolute inset-0 rounded-full transition-transform duration-100 ease-linear ${fill}`} style={{ transform: `translateX(${pct - 100}%)` }} />
      </div>
      <span
        className={`grid shrink-0 place-items-center rounded-full border-ink font-display font-extrabold text-on-accent tabular ${fill} ${big ? 'size-[clamp(4rem,7vh,5.5rem)] border-[3px] text-[clamp(2rem,3.6vh,3rem)] shadow-[0_4px_0_var(--ink)]' : 'size-11 border-2 text-xl shadow-[0_2px_0_var(--ink)]'}`}
        aria-live={urgent && secs === warnAt ? 'polite' : 'off'}
      >
        {secs}
      </span>
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
