import { useEffect, useRef } from 'react';

/*
 * Movement input for walking about: the keyboard (WASD or the arrows) and an
 * on-screen stick (Joystick.tsx) write into one shared vector that a scene
 * reads each frame. Keys typed into a text field or an answer box are left
 * alone, so answering a question never moves your Glim.
 */

export interface MoveInput {
  /** -1 (left) to 1 (right). */
  x: number;
  /** -1 (back, towards the camera) to 1 (forward). */
  y: number;
  /** Set by the stick while it is held. */
  stick: boolean;
}

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || Boolean(t.closest('[role="radiogroup"], [role="listbox"], [data-no-move]'));
}

/** A movement vector kept up to date from the keyboard while `enabled`. */
export function useMoveInput(enabled = true): MoveInput {
  const ref = useRef<MoveInput>({ x: 0, y: 0, stick: false });
  useEffect(() => {
    if (!enabled) return;
    const held = new Set<string>();
    const apply = () => {
      if (ref.current.stick) return;
      let x = 0;
      let y = 0;
      for (const k of held) {
        x += KEYS[k]![0];
        y += KEYS[k]![1];
      }
      const len = Math.hypot(x, y) || 1;
      ref.current.x = x / len;
      ref.current.y = y / len;
    };
    const down = (e: KeyboardEvent) => {
      if (!(e.code in KEYS) || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      held.add(e.code);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      if (!held.delete(e.code)) return;
      apply();
    };
    const clear = () => {
      held.clear();
      apply();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [enabled]);
  return ref.current;
}
