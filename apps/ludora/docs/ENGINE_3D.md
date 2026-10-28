# The 3D engine

`web/src/three/` is the small engine the 3D modes draw with, on three.js. A mode's rules stay in
the engine package like any other mode (`docs/GAME_MODE_SDK.md`, `docs/MODES_3D.md`); this is
only the picture. Gold Rush is the worked example: `web/src/features/room/modes/gold-rush.tsx`
(screens) and `gold-rush-scene.ts` (scenes).

## The shape of a 3D screen

```tsx
const scene = useRef<MyScene | null>(null);
useEffect(() => scene.current?.setState(stateFromView), [view]);      // push each new view in
<Stage3D<MyScene>
  label="What the picture shows, for screen readers"
  create={(env) => new MyScene(env, ...)}                            // build once
  onWorld={(w) => { scene.current = w; w?.setState(stateFromView); }}
  className="h-[40vh] lg:h-[60vh] rounded-[var(--radius-l)]"
  fallback={<PlainPicture />}                                        // shown with no 3D
/>
<Button onClick={...}>Dig</Button>                                    // the real controls: plain HTML
```

- **The scene is a picture, never the controls.** Every action is an ordinary button, list or
  answer box next to it, so the game plays the same with 3D off, on a switch, or with a screen
  reader. `fallback` is what shows instead of the canvas.
- **Scenes draw what the server said happened.** They smooth between views and play the
  animation for a change they see (a new find's `seq`, a new `bankedAt`), but never decide
  anything. Text that reports an outcome waits for its animation, so the words never give the
  picture away early.
- **Lazy-load.** Screens are already lazy in `modes/registry.ts`; three.js lands in the 3D mode's
  chunk only. Do not import `three/` from anything the main app loads.

## Pieces

| File | Use it for |
|---|---|
| `Stage3D.tsx` | Mounts a scene: renderer, canvas, size, frame loop (paused when hidden or off screen), frame-time monitor, fallback, and the graphics menu in the corner. |
| `World.ts` | Base class for a scene: `scene`, `camera`, sky dome, sun and fill light (`DAY`, `DUSK`, `NIGHT`), fog, `labels`, `fx`, `shadowArea()`. Implement `tick(dt, t)`; free extra resources in `dispose()`. |
| `glim3d.ts` | `new Glim3D({ look, quality, reducedMotion })`: a player's Glim in 3D. `setMoving(speed)`, `play('wave' / 'cheer' / 'dig' / 'cast' / 'reel' / 'type' / 'serve' / 'point' / 'sit' / 'hit' / 'celebrate')`, `setExpression('happy' / 'surprised' / 'determined' / 'dizzy' / 'proud' / 'sad')`, `setDim(true)`, `update(dt)` every frame. Get a look with `lookOf(avatar, fallbackArt(playerId))`. |
| `toon.ts` | `toon(colour, { glow })` cel-shaded materials (cached), `outline(mesh)`, `css('hsl(...)')`. |
| `props.ts` | Toy-style props: `tree('round' / 'gum' / 'pine' / 'palm')`, `bush`, `rock`, `crate`, `barrel`, `lantern`, `lampPost`, `fence`, `tent`, `sign(text)`, `nugget`, `gem`, `coin`, `ground`, `water` (call `.time(t)`), `bunting`, `blobShadow`, `seeded(n)`. |
| `particles.ts` | `world.fx.burst(pos, { color, shape: 'dot' / 'star' / 'spark' / 'square', count, speed, gravity, glow })`. |
| `labels.ts` | `world.labels.add(obj, 'Name', { offsetY, className: 'me' / 'small' / 'big' / 'tone-gold' / 'pop' })`: HTML tags over 3D things. |
| `camera.ts` | `FollowCamera` (third person), `OrbitCamera` (slow showcase), `EaseCamera` (eased to a spot). |
| `input.ts`, `Joystick.tsx` | `useMoveInput()` (WASD and arrows, ignoring keys typed into answers) and an on-screen stick writing to the same vector. |
| `net.ts` | `Smoother`: draws server-moved things slightly in the past, between pulses, so 10 updates a second look smooth. |

Pulses (Glow Tag's positions) come in as `pulse` on the screen's props: read `pulse.latest()` in
`tick` or `pulse.subscribe(fn)`. Send quiet moves with `fire(action)`, not `act`.

## Budgets

School laptops and old phones run these. The quality tier (`env.quality`) says what you can
afford; respect it.

- **Draw calls**: share geometry and materials (props and `toon()` already do). Prefer one big
  mesh to many small ones; use `InstancedMesh` for crowds of the same thing.
- **No point lights** with toon materials: they make hard discs. Fake lamplight with an additive
  glow sprite (see Gold Rush's lantern).
- **Shadows** only on `high` (`quality.shadows`); always draw blob shadows so lower tiers still
  ground things. Keep `shadowArea()` tight.
- **Outlines** only when `quality.outlines`.
- **Particles** are scaled by the tier automatically.
- **Glims** cost a few thousand triangles each; 30 on screen is fine, more than 40 is not. On the
  big screen, show the top few dozen.
- **Reduced motion**: `env.reducedMotion` stops idle bobbing, camera drift, spins and shakes.
  Game motion (walking, digging) still shows, gently.

## Checking it

- `/dev/three.html` (Vite dev server) shows Glims, props and Gold Rush's scenes with fake states:
  `?scene=gold&depth=6`, `?scene=field`, `?ids=glim-a,glim-b&action=dig`, `?quality=high`.
- Playwright can render WebGL with SwiftShader:
  `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`.
  Set `localStorage['ludora.graphics'] = 'high'` first to see the high tier (SwiftShader would
  otherwise be detected as `low`).
- The playable demo runs every mode with bots: `/demo.html#/play?mode=gold-rush&bots=11`, and its
  Big screen button shows the host view.
