import { useEffect, useRef } from 'react';
import { CylinderGeometry, Mesh } from 'three';
import type { GlimArt } from '@ludora/shared';
import { DAY, Glim3D, Stage3D, World, toon, type StageEnv } from '../../three/index.ts';

/*
 * The Glim Maker's 3D preview: the Glim being made, on a turntable, exactly as
 * it will look in the 3D modes. It is rebuilt (after a short pause) whenever
 * the art changes.
 */

class Turntable extends World {
  private glim: Glim3D | null = null;
  private spin = 0;

  constructor(env: StageEnv) {
    // Lit from the front, so the face and colours read as they will in a game.
    super(env, { ...DAY, sunFrom: [2, 6, 8] }, 35);
    const base = new Mesh(new CylinderGeometry(1.4, 1.55, 0.3, 40), toon('#2b2f6e'));
    base.position.y = -0.15;
    this.scene.add(base);
    this.camera.position.set(0, 1.15, 3.6);
    this.camera.lookAt(0, 0.62, 0);
  }

  setArt(art: GlimArt) {
    if (this.glim) {
      this.glim.removeFromParent();
      this.glim.dispose();
    }
    this.glim = new Glim3D({ look: { art }, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
    this.glim.play('wave');
    this.scene.add(this.glim);
  }

  tick(dt: number) {
    if (!this.glim) return;
    if (!this.env.reducedMotion) this.spin += dt * 0.6;
    this.glim.rotation.y = Math.sin(this.spin) * 0.55;
    this.glim.update(dt);
  }

  override dispose() {
    this.glim?.dispose();
    super.dispose();
  }
}

export function GlimTurntable({ art, className = '' }: { art: GlimArt; className?: string }) {
  const world = useRef<Turntable | null>(null);
  const latest = useRef(art);
  latest.current = art;
  const key = JSON.stringify(art);
  useEffect(() => {
    const t = setTimeout(() => world.current?.setArt(latest.current), 250);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <Stage3D<Turntable>
      label="Your Glim in 3D"
      create={(env) => new Turntable(env)}
      onWorld={(w) => {
        world.current = w;
        w?.setArt(latest.current);
      }}
      className={className}
      season={false}
      fallback={<p className="grid h-full place-items-center p-4 text-center text-sm text-text-2">3D is off on this device, so only the flat preview shows.</p>}
    />
  );
}
