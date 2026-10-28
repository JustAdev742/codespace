/*
 * Ludora's 3D engine. Import from here in mode screens; load the screen lazily so the engine
 * (and three.js) are only fetched for 3D modes. See docs/ENGINE_3D.md.
 */
export { Stage3D, GraphicsMenu, type Stage3DProps } from './Stage3D.tsx';
export { World, DAY, DUSK, NIGHT, type StageEnv, type Lighting } from './World.ts';
export { Glim3D, lookFor, type GlimAction } from './glim3d.ts';
export { EXPRESSIONS, type Expression, type GlimLook } from './glimTexture.ts';
export { FollowCamera, OrbitCamera, EaseCamera } from './camera.ts';
export { useMoveInput, type MoveInput } from './input.ts';
export { Joystick } from './Joystick.tsx';
export { toon, outline, outlineAll, hsl, css, disposeTree } from './toon.ts';
export * as props from './props.ts';
export { webglSupported, storedChoice, type Quality } from './quality.ts';
export { Smoother } from './net.ts';
