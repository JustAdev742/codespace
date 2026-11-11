import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { motionOK } from './stage.tsx';

/**
 * The one transition between phases of a room (lobby, get ready, question, leaderboard, results):
 * when `phase` changes, the new screen settles in from just below in 200 ms. Nothing is remounted,
 * so focus, announcements and answers in progress are untouched. Still with reduced motion.
 */
export function PhaseFade({ phase, children, className = '' }: { phase: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(phase);
  useLayoutEffect(() => {
    if (last.current === phase) return;
    last.current = phase;
    const el = ref.current;
    if (!el || !motionOK() || typeof el.animate !== 'function') return;
    el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [phase]);
  return (
    <div ref={ref} className={`flex flex-1 flex-col ${className}`}>
      {children}
    </div>
  );
}
