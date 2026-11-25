import { useLayoutEffect, useRef, type RefObject } from 'react';
import { motionOK } from './stage.tsx';

/**
 * Smooths a jump in where a block sits when the screen around it changes shape. When the timer leaves
 * at the reveal, the question under it moves up: with this, it starts from where it was and glides to
 * where it now is, so the eye never loses it at the very moment the answer lands.
 *
 * `scene` names what the block is showing (the question's round) and `shape` the layout around it (the
 * phase). The glide plays when the shape changes within one scene; a new scene simply appears where it
 * belongs (the screen's own entrance covers that). Still with less motion.
 */
export function useGlide(ref: RefObject<HTMLElement | null>, scene: string | number, shape: string) {
  const top = useRef<number | null>(null);
  const last = useRef({ scene, shape });
  // Every render: where the block sits now is where the next change starts from.
  useLayoutEffect(() => {
    const el = ref.current;
    const before = last.current;
    last.current = { scene, shape };
    if (!el) {
      top.current = null;
      return;
    }
    // offsetTop, not the bounding box: a glide already in flight must not move the starting line.
    const now = el.offsetTop;
    const was = top.current;
    top.current = now;
    if (before.scene !== scene || before.shape === shape) return;
    if (was === null || Math.abs(was - now) < 2 || !motionOK() || typeof el.animate !== 'function') return;
    el.animate([{ transform: `translateY(${was - now}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  });
}
