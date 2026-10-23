import type { ReactNode } from 'react';

/*
 * The stage: midnight navy under a blue floodlight, with the faint grid of a
 * pitch (the `.stage` class in app.css). Game screens, the landing hero and the
 * join flow sit on it, in both themes. Nothing drifts across it.
 */
export function Stage({ children, className = '', as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'main' }) {
  return <As className={`stage relative isolate overflow-hidden ${className}`}>{children}</As>;
}
