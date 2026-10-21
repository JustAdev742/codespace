import { useNow } from '../../../lib/useNow.ts';

/** Time left for a question, from the game clock. Announces the last five seconds to screen readers once. */
export function TimerBar({ deadline, start, gameNow, paused = false, tone = 'amber' }: { deadline: number | null; start: number; gameNow: () => number; paused?: boolean; tone?: 'amber' | 'violet' }) {
  useNow(100, deadline !== null && !paused);
  if (deadline === null) return null;
  const now = gameNow();
  const total = Math.max(1, deadline - start);
  const left = Math.max(0, deadline - now);
  const pct = (left / total) * 100;
  const secs = Math.ceil(left / 1000);
  const urgent = secs <= 5;
  return (
    <div className="flex items-center gap-3" aria-label={`${secs} seconds left`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-ember' : tone === 'violet' ? 'bg-dusk' : 'bg-lantern'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-10 text-right font-display text-xl font-bold tabular ${urgent ? 'text-ember' : 'text-text'}`} aria-live={urgent && secs === 5 ? 'polite' : 'off'}>
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
