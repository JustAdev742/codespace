import { useRef, useState } from 'react';
import type { MoveInput } from './input.ts';

/*
 * An on-screen thumb stick for touch screens. It writes into the same
 * movement vector as the keyboard. Drag anywhere in its circle; let go and
 * your Glim stops.
 */
export function Joystick({ input, className = '', label = 'Move' }: { input: MoveInput; className?: string; label?: string }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const move = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = r.width / 2;
    let dx = clientX - (r.left + max);
    let dy = clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
    const dead = 0.12;
    const nx = dx / max;
    const ny = -dy / max;
    const m = Math.hypot(nx, ny);
    input.x = m < dead ? 0 : nx;
    input.y = m < dead ? 0 : ny;
  };
  const end = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.x = 0;
    input.y = 0;
    input.stick = false;
  };

  return (
    <div
      ref={base}
      role="img"
      aria-label={`${label}: drag to walk`}
      className={`relative size-32 touch-none rounded-full bg-white/10 ring-2 ring-white/25 select-none ${className}`}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        input.stick = true;
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) move(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-14 rounded-full bg-white/80 shadow-[0_3px_0_rgb(0_0_0/0.3)]" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}
