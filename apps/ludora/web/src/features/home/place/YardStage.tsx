import { useEffect, useRef, type RefObject } from 'react';
import { Stage3D, type GlimLook } from '../../../three/index.ts';
import { schoolLook } from '../../../lib/school.ts';
import { GLIMS } from '../glims.ts';
import { HILLS_YARD, LUDORA_YARD, YardScene, type Anchors, type StationId } from './scene.ts';

/*
 * The yard on the page: the 3D stage and the wiring between the scene and the real menu over it.
 * This file (and three.js with it) is fetched only after the flat menu is up and usable; see
 * Place.tsx. Pointer and tilt reach the scene from here; the links never depend on it.
 */

export interface YardStageProps {
  look: GlimLook;
  /** Reduced motion or Calm: a still picture. */
  still: boolean;
  /** The place whose link is hovered or focused. */
  active: StationId | null;
  /** The phone's stacked layout: the camera comes in close, since no links stand over the picture. */
  compact: boolean;
  /** The menu's box. The pointer anywhere over it leans the view. */
  frame: RefObject<HTMLElement | null>;
  label: string;
  onAnchors: (a: Anchors) => void;
  onReady: () => void;
  /** No 3D after all (no WebGL, the context was lost, or it ran too slowly): show the flat menu. */
  onUnavailable: (reason: 'off' | 'unsupported' | 'lost' | 'slow') => void;
  /** False when the player asked for 3D themselves: lower the quality, but do not take it away. */
  giveUpWhenSlow: boolean;
}

export default function YardStage({ look, still, active, compact, frame, label, onAnchors, onReady, onUnavailable, giveUpWhenSlow }: YardStageProps) {
  const scene = useRef<YardScene | null>(null);
  const cb = useRef({ onAnchors, onReady, onUnavailable });
  cb.current = { onAnchors, onReady, onUnavailable };
  const stillRef = useRef(still);
  stillRef.current = still;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => scene.current?.setStill(still), [still]);
  useEffect(() => scene.current?.setActive(active), [active]);
  const compactRef = useRef(compact);
  compactRef.current = compact;
  useEffect(() => scene.current?.setCompact(compact), [compact]);

  // The pointer leans the view and turns the buddy; a drag on the picture itself looks round;
  // a press on the buddy gets a wave. Touch drags sideways only, so the page still scrolls.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const canvasOf = () => el.querySelector<HTMLCanvasElement>('canvas.s3-canvas');
    const at = (e: PointerEvent) => {
      const r = (canvasOf() ?? el).getBoundingClientRect();
      return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, y: 1 - ((e.clientY - r.top) / Math.max(1, r.height)) * 2 };
    };
    let drag: { id: number; x: number; y: number; moved: number } | null = null;
    const move = (e: PointerEvent) => {
      const s = scene.current;
      if (!s) return;
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        s.drag(dx, e.pointerType === 'touch' ? 0 : dy);
      }
      if (e.pointerType !== 'touch') {
        const p = at(e);
        s.setPointer(p.x, p.y);
      }
    };
    const down = (e: PointerEvent) => {
      if (e.target !== canvasOf() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = drag.moved < 6;
      drag = null;
      const p = at(e);
      if (tap && scene.current?.onBuddy(p.x, p.y)) scene.current.greet();
    };
    const leave = () => {
      drag = null;
      scene.current?.setPointer(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', leave);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', leave);
      el.removeEventListener('pointerleave', leave);
    };
  }, [frame]);

  // A phone or tablet tilted in the hand leans the view the same few degrees. Only where the
  // browser gives the tilt without asking (asking would put a permission prompt on the home page).
  useEffect(() => {
    const DOE = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & { requestPermission?: unknown }) | undefined;
    if (!DOE || typeof DOE.requestPermission === 'function' || !window.matchMedia('(pointer: coarse)').matches) return;
    let base: { b: number; g: number } | null = null;
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      base ??= { b: e.beta, g: e.gamma };
      scene.current?.setTilt((e.gamma - base.g) / 22, -(e.beta - base.b) / 22);
    };
    window.addEventListener('deviceorientation', tilt);
    return () => window.removeEventListener('deviceorientation', tilt);
  }, []);

  return (
    <Stage3D<YardScene>
      label={label}
      className="place-canvas"
      controls={false}
      season={false}
      onUnavailable={(reason) => cb.current.onUnavailable(reason)}
      create={(env) =>
        new YardScene(env, {
          look,
          friends: [GLIMS.lamplighter, GLIMS.dewdrop],
          palette: schoolLook() === 'hills-grammar' ? HILLS_YARD : LUDORA_YARD,
          still: stillRef.current,
          compact: compactRef.current,
          onAnchors: (a) => cb.current.onAnchors(a),
          onReady: () => cb.current.onReady(),
          onSlow: giveUpWhenSlow ? () => cb.current.onUnavailable('slow') : undefined,
        })
      }
      onWorld={(w) => {
        scene.current = w;
        w?.setActive(activeRef.current);
        w?.setCompact(compactRef.current);
      }}
    />
  );
}
