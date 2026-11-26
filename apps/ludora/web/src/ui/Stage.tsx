import type { ReactNode } from 'react';
import { NightScene } from '../art/NightScene.tsx';

/*
 * The stage: Ludora's night (the `.stage` class in app.css; ART_DIRECTION.md). Game screens, the
 * landing hero and the join flow sit on it, in both themes. `scene` puts the night's own picture
 * behind what is on it: hills under a low moon and lanterns in the sky ("night"), or the same with
 * the sky nearly empty, for behind something being read ("quiet").
 */
export function Stage({ children, className = '', as: As = 'div', scene = false }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'main'; scene?: 'night' | 'quiet' | false }) {
  return (
    <As className={`stage relative isolate overflow-hidden ${className}`}>
      {scene ? <NightScene quiet={scene === 'quiet'} /> : null}
      {children}
    </As>
  );
}
