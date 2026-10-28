import { type Camera, type Object3D, Vector3 } from 'three';

/*
 * Name tags and little callouts over 3D things, drawn as HTML on a layer above
 * the canvas: crisp at any resolution, in the app's own fonts, and cheaper
 * than text in WebGL. They are decoration for sighted players; every screen
 * says the same things in its plain controls, so the layer is aria-hidden.
 */

export interface LabelOptions {
  /** Metres above the target's origin. */
  offsetY?: number;
  /** Extra classes: `tone-gold`, `tone-bad`, `tone-good`, `small`, `big`. */
  className?: string;
  /** Hidden beyond this distance from the camera. */
  maxDistance?: number;
}

export interface Label {
  el: HTMLElement;
  target: Object3D;
  offsetY: number;
  maxDistance: number;
  visible: boolean;
  set(text: string): void;
}

const v = new Vector3();

export class LabelLayer {
  private labels = new Set<Label>();

  constructor(private readonly root: HTMLElement) {
    root.classList.add('s3-labels');
    root.setAttribute('aria-hidden', 'true');
  }

  add(target: Object3D, text: string, opts: LabelOptions = {}): Label {
    const el = document.createElement('div');
    el.className = `s3-label ${opts.className ?? ''}`;
    el.textContent = text;
    this.root.appendChild(el);
    const label: Label = {
      el,
      target,
      offsetY: opts.offsetY ?? 1.3,
      maxDistance: opts.maxDistance ?? 60,
      visible: true,
      set(t: string) {
        if (el.textContent !== t) el.textContent = t;
      },
    };
    this.labels.add(label);
    return label;
  }

  remove(label: Label | null | undefined) {
    if (!label) return;
    label.el.remove();
    this.labels.delete(label);
  }

  /** Move every label over its target. Called after each render. */
  update(camera: Camera, width: number, height: number) {
    const cam = camera.position;
    for (const l of this.labels) {
      let show = l.visible && l.target.visible;
      if (show) {
        l.target.getWorldPosition(v);
        v.y += l.offsetY;
        show = v.distanceTo(cam) <= l.maxDistance;
        if (show) {
          v.project(camera);
          show = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
          if (show) {
            const x = ((v.x + 1) / 2) * width;
            const y = ((1 - v.y) / 2) * height;
            l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          }
        }
      }
      const display = show ? '' : 'none';
      if (l.el.style.display !== display) l.el.style.display = display;
    }
  }

  clear() {
    for (const l of this.labels) l.el.remove();
    this.labels.clear();
  }
}
