import { type PerspectiveCamera, Vector3 } from 'three';

/*
 * Camera rigs. Each one eases towards where it wants to be, so the picture
 * never jumps, and none of them shakes or swoops under reduced motion.
 */

const tmp = new Vector3();

/** Third person: behind and above a target, looking a little ahead of it. */
export class FollowCamera {
  /** Metres behind the target. */
  distance = 6;
  /** Metres above the target. */
  height = 3.6;
  /** Extra turn around the target, in radians (dragging to look around). */
  yawOffset = 0;
  private target = new Vector3();
  private heading = 0;
  private placed = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {}

  /** Where to follow: a position and the way it faces (radians, 0 = +z). */
  follow(pos: Vector3, heading: number) {
    this.target.copy(pos);
    this.heading = heading;
  }

  update(dt: number) {
    const yaw = this.heading + this.yawOffset;
    const want = tmp.set(this.target.x - Math.sin(yaw) * this.distance, this.target.y + this.height, this.target.z - Math.cos(yaw) * this.distance);
    const k = this.placed ? 1 - Math.exp(-dt * (this.reducedMotion ? 3 : 6)) : 1;
    this.camera.position.lerp(want, k);
    this.placed = true;
    this.camera.lookAt(this.target.x + Math.sin(yaw) * 1.5, this.target.y + 0.8, this.target.z + Math.cos(yaw) * 1.5);
  }
}

/** A slow orbit around a point: big screens and showcases. Still under reduced motion. */
export class OrbitCamera {
  radius = 20;
  height = 12;
  /** Radians per second. */
  speed = 0.05;
  angle = 0.6;
  readonly centre = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {}

  update(dt: number) {
    if (!this.reducedMotion) this.angle += dt * this.speed;
    this.camera.position.set(this.centre.x + Math.sin(this.angle) * this.radius, this.centre.y + this.height, this.centre.z + Math.cos(this.angle) * this.radius);
    this.camera.lookAt(this.centre);
  }
}

/** Ease a camera to a spot and a point to look at (scripted views: zooming to a find). */
export class EaseCamera {
  readonly pos = new Vector3();
  readonly look = new Vector3();
  private curLook = new Vector3();
  private placed = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {}

  set(pos: Vector3 | [number, number, number], look: Vector3 | [number, number, number]) {
    if (Array.isArray(pos)) this.pos.set(...pos);
    else this.pos.copy(pos);
    if (Array.isArray(look)) this.look.set(...look);
    else this.look.copy(look);
  }

  update(dt: number) {
    const k = this.placed && !this.reducedMotion ? 1 - Math.exp(-dt * 4) : 1;
    this.camera.position.lerp(this.pos, k);
    this.curLook.lerp(this.look, k);
    this.placed = true;
    this.camera.lookAt(this.curLook);
  }
}
