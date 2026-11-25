import { useEffect, useRef, useState } from 'react';
import { motionOK } from './stage.tsx';

/**
 * A number that counts up to its new value over `ms` (points landing, a score growing), from where it
 * was shown last, or from `from` the first time. `delay` holds the count back for a beat (a score that
 * lands after the result that earned it). Jumps straight there with reduced motion. For what is seen
 * only: give screen readers the final value.
 */
export function useCountUp(value: number, ms = 650, from?: number, delay = 0): number {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);
  useEffect(() => {
    const start = current.current;
    if (start === value || !motionOK() || typeof requestAnimationFrame !== 'function') {
      current.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now() + delay;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, t - t0) / ms);
      // Fast at first, settling on the number: the ease of a score landing.
      const eased = 1 - Math.pow(1 - k, 3);
      const n = Math.round(start + (value - start) * eased);
      current.current = n;
      setShown(n);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, delay]);
  return shown;
}
