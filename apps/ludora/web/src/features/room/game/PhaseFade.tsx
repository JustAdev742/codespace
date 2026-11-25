import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { motionOK } from './stage.tsx';
import { fxLevel } from '../../../fx/index.ts';

const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * The one transition between phases of a room (lobby, get ready, question, leaderboard, results).
 * Nothing is remounted, so focus, announcements and answers in progress are untouched. Still with
 * reduced motion.
 *
 * It has two forms (D62). The plain one: the new screen settles in from just below in 200 ms, and
 * the old one is simply gone. Where the stage's effects are up, a scene change: the screen being
 * left lifts away towards the viewer while the new one arrives from behind it, so one scene gives
 * way to the next instead of cutting to it. The new screen is live from its first frame either way:
 * what leaves is a picture of the old one, and a tap goes straight through it.
 */
export function PhaseFade({ phase, children, className = '' }: { phase: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(phase);
  const leaving = useRef<HTMLElement | null>(null);
  // The phase is about to change and the page still shows the old one: this is the moment to take its picture.
  if (last.current !== phase && leaving.current === null && ref.current && motionOK() && fxLevel() !== 'plain') leaving.current = picture(ref.current);
  useLayoutEffect(() => {
    if (last.current === phase) return;
    last.current = phase;
    const el = ref.current;
    const old = leaving.current;
    leaving.current = null;
    if (!el || !motionOK() || typeof el.animate !== 'function') return;
    if (!old || !el.parentElement) {
      el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: SETTLE });
      return;
    }
    // A big screen takes its time; a phone's answers are there to be read at once.
    const big = window.innerWidth >= 1024;
    el.parentElement.append(old);
    const gone = () => old.remove();
    old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${big ? -18 : -10}px) scale(${big ? 1.04 : 1.025})` }], { duration: big ? 260 : 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.then(gone, gone);
    // Whatever happens to the animation (a tab put in the background), the picture does not outstay the change.
    setTimeout(gone, 1200);
    el.animate(
      [
        { opacity: 0, transform: `translateY(${big ? 26 : 12}px) scale(${big ? 0.95 : 0.975})` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: big ? 440 : 260, easing: SETTLE },
    );
  }, [phase]);
  return (
    <div ref={ref} className={`flex flex-1 flex-col ${className}`}>
      {children}
    </div>
  );
}

/**
 * A picture of a screen as it stands: a copy of it, fixed where it is, that nothing can reach (not a
 * tap, not a keyboard, not a screen reader) and in which nothing moves (stage.css, `.scene-leaving`).
 * A scene drawn on a canvas (a 3D game) cannot be copied this way, so it changes as it always has.
 */
function picture(el: HTMLElement): HTMLElement | null {
  if (el.querySelector('canvas, video, iframe')) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const copy = el.cloneNode(true) as HTMLElement;
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  copy.classList.add('scene-leaving');
  Object.assign(copy.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '5', pointerEvents: 'none' });
  return copy;
}
