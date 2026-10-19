# 07 - Portal rendering, traversal and physics: verified sources

Research notes for a browser three.js (WebGL) portal simulator. Compiled 2026-10-19.

How things were verified:
- **three.js API facts** come from grepping the npm package `three@0.186.1` (`REVISION = '186'`), installed under `scratchpad/threejs-inspect/node_modules/three`. They were also checked against the `r186` git tag on raw.githubusercontent.com.
- **PDFs** (Lengyel, GDC07 slides, CS50 slides, Eberly) were downloaded and read page by page. Equations typeset as graphics were read from rendered page images.
- **The oblique-projection formulas** were checked numerically against three.js r186 `Matrix4` element indexing (section 8). The script is `scratchpad/verify/oblique-check.mjs`.
- **Access status labels:**
  - `[READ]`: primary source fetched and read directly.
  - `[READ-SUMMARY]`: content was only visible through a summarising fetch tool, so quotes are short and the details are paraphrased.
  - `[SEARCH-ONLY]`: existence is known from search results, but the page was not read.
  - `[NOT ACCESSIBLE]`: the fetch was blocked or failed.
- Anything marked **(inference)** or **(derived)** is my own reasoning, not a statement from the cited source.

---

## 0. TL;DR

- **Lengyel's formula** (JGD 1(2), 2005). It uses a camera-space clip plane `C = (Cx,Cy,Cz,Cw)` with the camera on the negative side (`Cw < 0`). First compute `C' = (M^-1)^T C`, `Q' = (sgn C'x, sgn C'y, 1, 1)` and `Q = M^-1 Q'`. Then replace the third row of M:
  `M'3 = (2 M4.Q / C.Q) C - M4` (eq. 13/20).
  For a perspective matrix `M4 = (0,0,-1,0)`, which gives `M'3 = (-2 Qz / C.Q) C + (0,0,1,0)` (eq. 14). Eq. 15 gives `Qz = -1`, so the scale factor reduces to `2 / (C.Q)`.
- **Lengyel's code** in three.js `Matrix4.elements` terms (column-major; third row = `e[2], e[6], e[10], e[14]`):
  ```
  q = ((sgn(C.x)+e[8])/e[0], (sgn(C.y)+e[9])/e[5], -1, (1+e[10])/e[14])
  c = C * 2/dot(C,q)
  e[2]=c.x; e[6]=c.y; e[10]=c.z+1; e[14]=c.w
  ```
  r186 `Reflector.js` and `Refractor.js` contain exactly this code, and `ReflectorNode.js` has a WebGPU `[0,1]`-depth variant.
- **three.js r186 API facts:**
  - `CameraUtils.frameCorners(camera, bottomLeft, bottomRight, topLeft, estimateViewFrustum=false)` exists. It implements Kooima's off-axis projection.
  - `examples/webgl_portal.html` exists in r186. It uses 256x256 `WebGLRenderTarget`s, mirrors the camera position by negating local x and z (which is R_y(pi)), calls `frameCorners`, and puts the texture on a `MeshBasicMaterial` map.
  - `new WebGLRenderer({ stencil })` defaults to **false** (since r163). Render target `stencilBuffer` also defaults to false.
  - Stencil material props: `stencilWrite, stencilWriteMask, stencilFunc, stencilRef, stencilFuncMask, stencilFail, stencilZFail, stencilZPass`.
  - Renderer clearing: `autoClear`, `autoClearColor`, `autoClearDepth`, `autoClearStencil`, `clear(color,depth,stencil)`, `clearStencil()`.
  - Clipping: `renderer.localClippingEnabled` (default false) and `Material.clippingPlanes` (world space) both exist.
  - `WebGLRenderTarget(width=1, height=1, options={})`.
  - Camera matrices: `Camera.projectionMatrixInverse` exists.
  - Color: `renderer.outputColorSpace` defaults to `SRGBColorSpace` (`'srgb'`), and `ColorManagement.enabled` is true.
  - Lights: `useLegacyLights` is absent from r186 source. Point and spot intensity are in candela, with decay defaulting to 2.
  - Import map pattern: `"three"` maps to `build/three.module.js` and `"three/addons/"` maps to `examples/jsm/`.
- **The portal-to-portal rigid transform** `T = M_B * R_y(pi) * M_A^-1` is stated in three published forms:
  - Wikibooks "OpenGL Programming/Mini-Portal", as `portal_view` (view-matrix form).
  - Daniel Ilett, Portals Part 2/4, as Unity code using `Quaternion.Euler(0,180,0)`.
  - three.js `webgl_portal.html`, as the `x *= -1; z *= -1` mirror in the portal's local frame.
- **Best Valve sources:**
  - The Portal (2007) developer commentary by David Kircher, transcribed on the Portal Wiki. It covers the stencil switch, a maximum of 9 recursive views, cloning objects for collision, and dynamic collision "bubbles".
  - CS50 GD50 2018 Lecture 11, "Portal Problems", by Dave Kircher & Tejeev Kohli of Valve (video and slides).

---

## 1. Eric Lengyel - oblique near-plane clipping

### 1.1 Citations and access

| Source | URL | Status |
|---|---|---|
| E. Lengyel, "Oblique View Frustum Depth Projection and Clipping", *Journal of Game Development*, Vol. 1, No. 2 (March 2005), pp. 5-16. 11-page PDF; its last page says "(Updated in June 2025.)", re-typeset with the Radical Pie equation editor. | https://terathon.com/lengyel/Lengyel-Oblique.pdf | [READ] |
| E. Lengyel, "Modifying the Projection Matrix to Perform Oblique Near-Plane Clipping", blog post dated May 28, 2004. The old URL `terathon.com/code/oblique.html` now returns **301** to the new location. | https://terathon.com/blog/oblique-clipping.html | [READ] |
| E. Lengyel, "Projection Matrix Tricks", slides, Game Developers Conference 2007 (title slide: "March 5-9, 2007 in San Francisco"). | https://terathon.com/gdc07_lengyel.pdf | [READ] |
| *Game Programming Gems 5*, Section 2.6, cited by the blog page. | - | not accessed |
| *Foundations of Game Engine Development, Vol. 2: Rendering*, cited in the blog's edit note ("covered in much greater detail"). | - | not accessed |
| NVIDIA ad hoc implementation cited as ref. [1] in the paper: `http://developer.nvidia.com/object/oblique_frustum_clipping.html` | - | not accessed (legacy URL) |

### 1.2 Conventions (paper, section 2)

- **API and spaces.** The paper is written for OpenGL. For Direct3D, "the derivation in the next section can be reapplied". In camera space the camera sits at the origin and looks down **-z**, with x right and y up (right-handed).
- **Plane representation.** `C = <Nx, Ny, Nz, -N.Q>` (eq. 1), where N points away from the front side of the plane and Q is any point on it. For a unit N and `Pw = 1`, `C.P` is the signed distance from P to the plane.
- **Transforming points and planes (eq. 2):**
  ```
  P' = M P
  C' = (M^-1)^T C
  ```
  Planes are covariant, so they transform by the inverse transpose.
- **Clip-space inside test (eq. 3):** `-w <= x <= w`, `-w <= y <= w`, `-w <= z <= w`.
- **Table 1** lists the frustum planes. `M_i` is the i-th **row** of M.

  | Plane | Clip-space plane | Camera-space plane |
  |---|---|---|
  | Near | `<0,0,1,1>` | `M4 + M3` |
  | Far | `<0,0,-1,1>` | `M4 - M3` |
  | Left | `<1,0,0,1>` | `M4 + M1` |
  | Right | `<-1,0,0,1>` | `M4 - M1` |
  | Bottom | `<0,1,0,1>` | `M4 + M2` |
  | Top | `<0,-1,0,1>` | `M4 - M2` |

### 1.3 The algorithm (paper, sections 3-5; equation numbers as printed)

- **Inputs.** `C = <Cx, Cy, Cz, Cw>` in **camera space**. "The camera should lie on the negative side of the plane, so we can assume that Cw < 0."
- **Eq. 4:** we need `C = M4 + M3`.
- **M4 cannot change.** Perspective projections use M4 to put -z into w, which perspective-correct interpolation depends on. So only the third row is replaced:
  - **Eq. 5:** `M'3 = C - M4`.
  - **Eq. 6:** the far plane becomes `F = M4 - M'3 = 2 M4 - C`. With `M4 = <0,0,-1,0>`, the near and far planes are no longer parallel when Cx or Cy is non-zero, and they intersect in the x-y plane.
- **Choosing the scale.** The free scale of C is chosen so the far plane passes through the frustum corner opposite C:
  - Project C into clip space with the original matrix: `C' = (M^-1)^T C`.
  - **Eq. 7:** `Q' = <sgn(C'x), sgn(C'y), 1, 1>`.
  - Paper: "(For most perspective projections, it is safe to assume that the signs of C'x and C'y are the same as Cx and Cy, so the projection of C into clip space can be avoided.)"
  - `Q = M^-1 Q'`.
  - **Eq. 8:** `F = 2 M4 - a C`.
  - **Eq. 9:** `a = (2 M4 . Q) / (C . Q)`, obtained by solving `F . Q = 0`.
  - **Eq. 10:** `M'3 = a C - M4`.
- **Infinite projection matrices.** The method also works for them. The new far plane ends up parallel to one of the frustum's side edges.
- **Section 4, standard OpenGL perspective matrix (eq. 11):**
  ```
  M = [ 2n/(r-l)   0          (r+l)/(r-l)    0           ]
      [ 0          2n/(t-b)   (t+b)/(t-b)    0           ]
      [ 0          0         -(f+n)/(f-n)   -2fn/(f-n)   ]
      [ 0          0         -1              0           ]
  ```
  Its inverse (eq. 12):
  ```
  M^-1 = [ (r-l)/2n   0          0             (r+l)/2n  ]
         [ 0          (t-b)/2n   0             (t+b)/2n  ]
         [ 0          0          0            -1         ]
         [ 0          0         -(f-n)/2fn     (f+n)/2fn ]
  ```
- **Eq. 13:** `M'3 = (2 M4.Q / C.Q) C - M4`.
- **Eq. 14** (since `M4 = <0,0,-1,0>`): `M'3 = (-2 Qz / C.Q) C + <0,0,1,0>`.
- **Eq. 15:** `Q = [ sgn(Cx)(r-l)/2n + (r+l)/2n ,  sgn(Cy)(t-b)/2n + (t+b)/2n ,  -1 ,  1/f ]^T`.
  - Because `Qz = -1`, the factor is exactly **`a = 2/(C.Q)`**.
- **Sanity check (eq. 16).** Take `C = <0,0,-1,-d>`. Then `C.Q = 1 - d/f`, and
  `M'3 = 2/(1-d/f) <0,0,-1,-d> + <0,0,1,0> = <0, 0, -(f+d)/(f-d), -2fd/(f-d)>`.
  With `d = n` this recovers the original matrix.
- **Depth precision (eqs. 17-19).** In direction V, `lim z(s) = -(a(C.V) + Vz)/Vz`. For `V = <0,0,-1,0>` this is below 1 when `aCz > -2`, in which case the far plane is never reached and part of the depth range is lost. Precision gets worse as the angle between C's normal and the z-axis grows, and as the camera-to-plane distance grows. The paper still found that "enough discrete depth values are still utilized in a standard 24-bit depth buffer to render images without artifacts in almost all real-world situations."
- **Eq. 20 (conclusion).** For any invertible M and any C with `Cw < 0`:
  ```
  M' = [ M1 ; M2 ; (2 M4.Q / C.Q) C - M4 ; M4 ],   Q = M^-1 Q'
  ```
  For a perspective M, the third row simplifies to eq. 14.

### 1.4 Lengyel's reference code (blog, 2004)

The page says the code assumes a perspective projection, "standard or infinite". The clip plane "must be in camera-space coordinates, and its w-coordinate must be negative (corresponding to the camera being on the negative side of the plane)". Core lines, verbatim:

```c
q.x = (sgn(clipPlane.x) + matrix[8]) / matrix[0];
q.y = (sgn(clipPlane.y) + matrix[9]) / matrix[5];
q.z = -1.0F;
q.w = (1.0F + matrix[10]) / matrix[14];

// Calculate the scaled plane vector
Vector4D c = clipPlane * (2.0F / Dot(clipPlane, q));

// Replace the third row of the projection matrix
matrix[2] = c.x;
matrix[6] = c.y;
matrix[10] = c.z + 1.0F;
matrix[14] = c.w;
```

`matrix[]` is the OpenGL column-major float[16], read with `glGetFloatv(GL_PROJECTION_MATRIX, ...)`. three.js `Matrix4.elements` uses the same column-major layout (the `Matrix4.js` header confirms "column-major"), so the indices carry over unchanged.

**GDC07 slides** (read). They restate the method:
- "Let C = (Cx, Cy, Cz, Cw) be the camera-space plane", and "We assume the camera is on the negative side of the plane, so Cw < 0".
- `M3 = C - M4 = (Cx, Cy, Cz + 1, Cw)` and `F = M4 - M3 = 2M4 - C`.
- `F = 2M4 - aC`, `Q = M^-1 (sgn(Cx), sgn(Cy), 1, 1)` and `a = 2M4.Q / C.Q`.
- Closing note: "For more analysis, see Journal of Game Development, Vol 1, No 2".

### 1.5 Sign conventions and pitfalls when porting to three.js

1. **three.js `Plane` matches Lengyel's C.** A point satisfies `normal.p + constant = 0`, so `C = new Vector4(n.x, n.y, n.z, constant)`. three.js itself builds C this way (`Reflector.js`, lines ~170-176):
   ```js
   reflectorPlane.setFromNormalAndCoplanarPoint( normal, reflectorWorldPosition );
   reflectorPlane.applyMatrix4( reflectionCamera.matrixWorldInverse );
   clipPlane.set( reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant );
   ```
   `Plane.applyMatrix4(matrix, optionalNormalMatrix)` transforms the normal with the normal matrix, which handles the inverse-transpose rule.
2. **Which side is kept.** Geometry with `C.P > 0` is kept and the camera side (`C.P < 0`) is clipped. For a portal pair, use the **exit** portal's plane with its normal pointing **away from the virtual camera**, into the room beyond the exit portal. The virtual camera then sits behind it, so `Cw < 0`. (inference, consistent with the paper's convention and the numeric test in section 8)
3. **Always start from an unmodified matrix.** The `q` shortcut reads the original `e[8], e[9], e[10], e[14]`. Copy the main camera's `projectionMatrix` every frame before modifying it, as Reflector does with `reflectionCamera.projectionMatrix.copy( camera.projectionMatrix )`. Never call `updateProjectionMatrix()` afterwards, because it overwrites the matrix.
4. **Keep `projectionMatrixInverse` in sync.** `Vector3.unproject` (used by `Raycaster.setFromCamera`) and `CameraHelper` read it. Set it with `camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()`; `frameCorners` already does this.
5. **Too-close guard.** When the virtual camera is very close to the portal plane (`|Cw|` small), the oblique frustum degenerates. Sebastian Lague's `Portal.cs` adds `nearClipOffset = 0.05` and falls back to the normal projection when `|camSpaceDst| <= nearClipLimit (0.2)` (section 4.1). three.js Reflector and Refractor expose a `clipBias` instead.
6. **Coordinate systems and depth modes in r186:**
   - `Matrix4.makePerspective(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false)`.
   - WebGL default mapping: NDC z in [-1,1], with third row `c = -(f+n)/(f-n)` and `d = -2fn/(f-n)`. Lengyel's formula applies as is.
   - `WebGPUCoordinateSystem` (z in [0,1]): `ReflectorNode.js` uses `clipPlane.multiplyScalar(1.0 / dot(q))` and `e[10] = clipPlane.z - clipBias` (no `+1`). This is correct; see the numeric check in section 8B.
   - The **WebGL branch of `ReflectorNode.js`** also uses `1.0/dot(q)` with `+1`. The near plane is still exactly C, but the far plane is not Lengyel's optimum; the far corner maps to NDC z = 0 instead of 1 (section 8C, observation).
   - **Reversed depth.** `WebGLRenderer({ reversedDepthBuffer: true })` requires `EXT_clip_control`; near maps to 1 and far to 0. `Reflector.js` in r186 has **no** reversed-depth branch.
     - Derived variant, verified numerically in section 8D: `Q = M^-1 (sgn,sgn,0,1)`, `a = (M4.Q)/(C.Q)` and `M'3 = M4 - aC`.
   - **`logarithmicDepthBuffer`** writes `gl_FragDepth`; the interaction with oblique projection was not verified.
7. **Frustum culling follows the oblique matrix.** `WebGLRenderer.render` calls `_frustum.setFromProjectionMatrix( projectionMatrix * matrixWorldInverse, WebGLCoordinateSystem, camera.reversedDepth )`, which takes the near plane as `row4 + row3`. After the modification, that culling near plane is the portal plane itself. (verified in `Frustum.js`; the consequence is inference)
8. **three.js clipping planes are per-fragment.** They are implemented as a fragment-shader `discard` (`clipping_planes_fragment.glsl.js`: `if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;`). Oblique projection costs nothing per fragment; clipping planes cost a discard and disable early-z (inference for the early-z part).

---

## 2. three.js r186 - verified API facts (npm `three@0.186.1`)

### (a) `examples/jsm/utils/CameraUtils.js` - **exists**; exports `frameCorners`

- **File and docs.** `node_modules/three/examples/jsm/utils/CameraUtils.js` (3204 bytes) ends with `export { frameCorners };`. Docs: https://threejs.org/docs/pages/module-CameraUtils.html [READ]. Import with `import * as CameraUtils from 'three/addons/utils/CameraUtils.js';`.
- **Signature:** `frameCorners( camera, bottomLeftCorner, bottomRightCorner, topLeftCorner, estimateViewFrustum = false )`.
- **JSDoc:** "Set projection matrix and the orientation of a perspective camera to exactly frame the corners of an arbitrary rectangle. NOTE: This function ignores the standard parameters; do not call `updateProjectionMatrix()` after this."
- **What the code does:**
  - Builds the screen basis: `vr = normalize(pb-pa)`, `vu = normalize(pc-pa)` and `vn = normalize(vr x vu)`.
  - Computes the eye-to-screen distance `d = -(pa-pe).vn`.
  - Computes the edges `l,r,b,t` in eye space, scaled by `n/d`.
  - Sets `camera.quaternion` so the camera faces the rectangle.
  - Writes the off-axis glFrustum-style `camera.projectionMatrix` and sets `projectionMatrixInverse = projectionMatrix^-1`.
  - With `estimateViewFrustum = true`, it also sets `camera.fov` to a conservative estimate so frustum culling works.
- **Inputs it reads.** It uses `camera.position` (local, not world, position), `camera.near` and `camera.far`.
- **Near-plane behaviour (inference from the code).** The near plane ends up parallel to the portal rectangle at distance `camera.near` from the eye, not at the portal plane. To clip exactly at the portal plane with this method, set `camera.near` to just under `d` before calling it. In that case no oblique matrix is needed, because the image plane is already parallel to the portal.
- **Origin.** Older three.js docs (mirror at https://www.crachecode.net/vendor/three.js/docs/examples/en/utils/CameraUtils.html, [READ]) credit "Kooima's Generalized Perspective Projection formulation" and link `https://web.archive.org/web/20191110002841/http://csc.lsu.edu/~kooima/articles/genperspective/index.html`. web.archive.org reset the connection during this session [NOT ACCESSIBLE].

### (b) Official example `webgl_portal.html` - **exists in r186**

- **Where.** https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgl_portal.html is byte-identical to the `dev` branch on 2026-10-19 (9149 bytes). It is also live at https://threejs.org/examples/webgl_portal.html (HTTP 200). [READ]
- **Technique:**
  - **Renderer.** `localClippingEnabled = true` and `toneMapping = ACESFilmicToneMapping`.
  - **Portal meshes.** Two `PlaneGeometry(100.1,100.1)` meshes scaled 0.35, at x = -30 and x = +30, both facing +z. Each uses `new THREE.MeshBasicMaterial({ map: renderTarget.texture })` with a `new THREE.WebGLRenderTarget(256, 256)`. Standard mesh UVs are used, not screen-space UVs.
  - **Virtual camera.** `PerspectiveCamera(45, 1.0, 0.1, 500.0)`.
  - **Camera position.** For each portal it computes:
    ```js
    thisPortalMesh.worldToLocal( reflectedPosition.copy( camera.position ) );
    reflectedPosition.x *= - 1.0; reflectedPosition.z *= - 1.0;
    otherPortalMesh.localToWorld( reflectedPosition );
    ```
    Negating local x and z is a rotation of pi about local Y (`diag(-1,1,-1)`). This is `M_other * R_y(pi) * M_this^-1` applied to a point.
  - **Projection.** The other portal's corners are taken with left and right swapped ("the portal is viewed backwards; flip the left/right coordinates"). Then `CameraUtils.frameCorners( portalCamera, bottomLeftCorner, bottomRightCorner, topLeftCorner, false )` is called.
  - **Render pass.** For each portal:
    1. Set `thisPortalTexture.texture.colorSpace = renderer.outputColorSpace`.
    2. Call `setRenderTarget`.
    3. Call `renderer.state.buffers.depth.setMask( true )`. This is a workaround for issue #18897; in r186 `clear()` itself also calls `depth.setMask(true)`.
    4. Call `renderer.clear()` if `autoClear === false`.
    5. Hide this portal mesh, render, then show it again.
  - **State saved around the portal passes.** `renderer.xr.enabled = false` and `renderer.shadowMap.autoUpdate = false`.
  - **Moving spheres.** They use `clippingPlanes: [ new THREE.Plane(new THREE.Vector3(0,0,1), 0) ]` and `clipShadows: true`, so nothing behind the z = 0 portal plane leaks into the views. This is a world clip plane instead of an oblique near plane.
  - **Lights.** `PointLight(color, intensity, distance, decay=0)`, for example `new THREE.PointLight( 0xe7e7e7, 2.5, 250, 0 )`.
  - **No recursion.** Each portal texture is rendered once per frame from the previous frame's other-portal texture, so any recursion lags by a frame and has depth 1 per frame (inference from the code).
- **Related r186 examples** (from `examples/files.json` at tag r186):
  - `webgl_clipping_stencil`, `webgl_mirror`, `webgl_refraction` and `misc_controls_pointerlock`.
  - `webgpu_portal`. **It is not a linked portal:** it renders a second `Scene` with the same main camera via `pass( scenePortal, camera ).context( { getUV: () => screenUV } )` and samples it in screen space on a plane ("window into another world").

### (c) Stencil API

**Material properties** (`src/materials/Material.js`, defaults):

| Property | Default |
|---|---|
| `stencilWrite` | `false` |
| `stencilWriteMask` | `0xff` |
| `stencilFunc` | `AlwaysStencilFunc` |
| `stencilRef` | `0` |
| `stencilFuncMask` | `0xff` |
| `stencilFail` | `KeepStencilOp` |
| `stencilZFail` | `KeepStencilOp` |
| `stencilZPass` | `KeepStencilOp` |

Other relevant properties: `depthTest` (true), `depthWrite` (true), `depthFunc` (`LessEqualDepth`), `colorWrite` (true), `side` (`FrontSide`), `polygonOffset`, `polygonOffsetFactor`, `polygonOffsetUnits`, `forceSinglePass` and `alphaToCoverage`. `Object3D.renderOrder` (default 0) controls draw order.

**Constants** (`src/constants.js`):
- Stencil ops: `ZeroStencilOp=0`, `KeepStencilOp=7680`, `ReplaceStencilOp=7681`, `IncrementStencilOp=7682`, `DecrementStencilOp=7683`, `IncrementWrapStencilOp=34055`, `DecrementWrapStencilOp=34056`, `InvertStencilOp=5386`.
- Stencil funcs: `NeverStencilFunc=512`, `LessStencilFunc`, `EqualStencilFunc`, `LessEqualStencilFunc`, `GreaterStencilFunc`, `NotEqualStencilFunc`, `GreaterEqualStencilFunc`, `AlwaysStencilFunc=519`.

**WebGLRenderer:**
- **Constructor options** (r186 defaults): `depth = true`, **`stencil = false`**, `alpha = false`, `antialias = false`, `premultipliedAlpha = true`, `preserveDrawingBuffer = false`, `powerPreference = 'default'`, `failIfMajorPerformanceCaveat = false`, `reversedDepthBuffer = false` and `outputBufferType = UnsignedByteType`. `logarithmicDepthBuffer` is documented as an option, default false.
  - JSDoc: "`[stencil=false]` Whether the drawing buffer has a stencil buffer of at least 8 bits or not."
  - Migration Guide r162 to r163: "The `stencil` context attribute of `WebGLRenderer` is now `false` by default for performance reasons. If you use stencil related logic in your app, you have to enable `stencil` explicitly now." (https://github.com/mrdoob/three.js/wiki/Migration-Guide, raw `https://raw.githubusercontent.com/wiki/mrdoob/three.js/Migration-Guide.md` [READ])
  - Since r163, `WebGLRenderer` no longer supports WebGL 1.
- **Clearing:**
  - Properties `autoClear`, `autoClearColor`, `autoClearDepth` and `autoClearStencil` all default to `true`.
  - `clear( color = true, depth = true, stencil = true )`. It forces `state.buffers.depth.setMask(true)` and `state.buffers.stencil.setMask(0xffffffff)` before `gl.clear`.
  - `clearColor()`, `clearDepth()` and `clearStencil()`.
- **Low-level stencil state:** `renderer.state.buffers.stencil.{ setTest, setMask, setFunc(func, ref, mask), setOp(fail, zfail, zpass), setLocked, setClear, reset }`. The material's stencil fields are applied through these in `WebGLState.setMaterial`.
- **Render targets.** `stencilBuffer` defaults to **false**; pass `{ stencilBuffer: true }`. This has been the default since r120 per the Migration Guide.
- **Official stencil example** `webgl_clipping_stencil.html` (r186):
  - Creates `new THREE.WebGLRenderer( { antialias: true, stencil: true } )` and sets `renderer.localClippingEnabled = true`.
  - Uses `stencilWrite`, `stencilFunc`, `stencilRef`, `stencilFail`, `stencilZFail`, `stencilZPass` and `renderOrder`.
  - Calls `renderer.clearStencil()` in an `onAfterRender` hook.

### (d) Clipping

- **`renderer.localClippingEnabled`** exists, default `false`.
- **`renderer.clippingPlanes`** (default `[]`) holds global planes "specified in world space ... Points in space whose dot product with the plane is negative are cut away."
- **`Material.clippingPlanes`** (default `null`): "User-defined clipping planes specified as THREE.Plane objects in world space ... Points in space whose signed distance to the plane is negative are clipped (not rendered). This requires `WebGLRenderer#localClippingEnabled` to be `true`."
- **Related:** `Material.clipIntersection` (false) and `Material.clipShadows` (false).

### (e) `WebGLRenderTarget`

- **Signature:** `constructor( width = 1, height = 1, options = {} )`, extending `RenderTarget`.
- **`RenderTarget~Options` defaults:**
  - Texture setup: `generateMipmaps=false`, `magFilter=LinearFilter`, `minFilter=LinearFilter`, `format=RGBAFormat`, `type=UnsignedByteType`, `internalFormat=null`, `wrapS/wrapT=ClampToEdgeWrapping`, `anisotropy=1`, `colorSpace=NoColorSpace`.
  - Buffers: `depthBuffer=true`, `stencilBuffer=false`, `depthTexture=null`.
  - Multisampling: `resolveColorBuffer=true`, `resolveDepthBuffer=true`, `resolveStencilBuffer=true`, `storeMultisampled{Color,Depth,Stencil}Buffer=true`, `samples=0`.
  - Layers and attachments: `count=1`, `depth=1`, `multiview=false`, `useArrayDepthTexture=false`.
- **Renderer methods:** `renderer.setRenderTarget( renderTarget, activeCubeFace = 0, activeMipmapLevel = 0 )` and `renderer.getRenderTarget()`.
- **Viewport and scissor scaling.** r186 `setViewport` and `setScissor` always multiply by pixel ratio. The Migration Guide for **r186 to r187** says they "no longer scale by pixel ratio when a render target is bound". Pin the version.

### (f) Camera

- **`Camera` fields:**
  - `matrixWorldInverse`, `projectionMatrix` and **`projectionMatrixInverse`** (all `Matrix4`).
  - `coordinateSystem` (default `WebGLCoordinateSystem`).
  - A `reversedDepth` getter.
- **`Camera.updateMatrixWorld()`.** It recomputes `matrixWorldInverse` and *excludes scale* ("exclude scale from view matrix to be glTF conform"). Keep portal frames rigid, with no scale, when composing the virtual camera (inference).
- **`PerspectiveCamera`.** `updateProjectionMatrix()` calls `makePerspective(..., this.coordinateSystem, this.reversedDepth)` and recomputes `projectionMatrixInverse`.
- **`WebGLRenderer.render`.** It auto-calls `camera.updateMatrixWorld()` only when `camera.parent === null && camera.matrixWorldAutoUpdate === true`.

### (g) Math, scene and raycasting classes (all present)

- **`Matrix4`:**
  - `makeRotationFromQuaternion(q)`, `makeRotationY`, `makeRotationAxis`, `makeBasis`, `extractBasis`, `extractRotation`.
  - `compose(position, quaternion, scale)`, `decompose(...)`, `invert()`, `multiply`, `premultiply`, `multiplyMatrices`.
  - `makePerspective(left, right, top, bottom, near, far, coordinateSystem, reversedDepth)`, `makeOrthographic(...)`, `makeTranslation(x,y,z)`, `makeScale`, `lookAt`, `setPosition`, `copyPosition`, `determinant`, `transpose`.
  - Storage: "internally ... stored ... in column-major order"; `set()` takes row-major arguments.
- **`Plane`:**
  - Constructor `( normal = (1,0,0), constant = 0 )`, in Hessian normal form.
  - `set`, `setComponents`, `setFromNormalAndCoplanarPoint`, `setFromCoplanarPoints`, `normalize`, `negate`, `distanceToPoint`, `distanceToSphere`, `projectPoint`, `intersectLine`, `intersectsLine/Box/Sphere`, `coplanarPoint`.
  - **`applyMatrix4( matrix, optionalNormalMatrix )`**. The JSDoc says "The matrix must be an affine, homogeneous transform".
  - `translate`.
- **`Vector4`.** Exists, with `set`, `dot`, `applyMatrix4`, `multiplyScalar` and `setFromMatrixPosition`.
- **`Quaternion`:** `setFromEuler`, `setFromAxisAngle`, `setFromRotationMatrix`, `setFromUnitVectors`, `invert`, `conjugate`, `multiply`, `premultiply`, `multiplyQuaternions`, `slerp`.
- **`Vector3`:** `applyMatrix4`, `applyQuaternion`, `transformDirection`, `reflect`, `applyMatrix3`, `applyNormalMatrix`, `setFromMatrixPosition`, `setFromMatrixColumn`, `projectOnPlane`, `crossVectors`, `unproject` (uses `projectionMatrixInverse`).
- **`Object3D`:**
  - Methods: `localToWorld`, `worldToLocal`, `getWorldPosition`, `getWorldQuaternion`, `getWorldDirection`, `updateMatrixWorld`, `updateWorldMatrix`, `attach`, `onBeforeRender`, `onAfterRender`.
  - Fields: `layers` (a `Layers` with `set/enable/enableAll/toggle/disable/disableAll/test/isEnabled`), `renderOrder`, `frustumCulled`, `matrixAutoUpdate`, `matrixWorldAutoUpdate`.
  - Two version notes: r186 adds `Object3D.dispose()`, and from r185 `updateWorldMatrix()` honours `matrixWorldNeedsUpdate`.
- **`Raycaster`:**
  - `set(origin, direction)`, `setFromCamera(coords, camera)`, `intersectObject(object, recursive = true, intersects = [])`, `intersectObjects(objects, recursive = true, intersects = [])`, and a `layers` field.
  - Intersection fields: `distance`, `point` (world), `face`, `faceIndex`, `object`, `uv`, `uv1`, `normal`, `instanceId`, and `barycoord` in `Mesh`.
  - **Pitfall:** `Mesh.raycast` computes `intersection.normal` (the interpolated vertex normal, flipped to face the ray) and `face.normal` in the mesh's **local/object space**. Only `point` is transformed to world. Use `n.transformDirection(object.matrixWorld)` for rigid transforms, or the normal matrix under non-uniform scale.
- **`Timer`** (core, `THREE.Timer`):
  - Methods: `connect(document)` (Page Visibility API), `disconnect`, `update(timestamp?)`, `getDelta()` and `getElapsed()` (both **in seconds**), `setTimescale`, `reset`, `dispose`.
  - `Clock` is **deprecated since r183** ("Please use THREE.Timer instead").

### (h) Color management and lights (r186)

- **Color management:**
  - `ColorManagement.enabled: true` and `workingColorSpace: LinearSRGBColorSpace`.
  - `renderer.outputColorSpace` defaults to `SRGBColorSpace`. The constants are `SRGBColorSpace = 'srgb'`, `LinearSRGBColorSpace = 'srgb-linear'` and `NoColorSpace = ''`.
  - History (Migration Guide r151 to r152): `outputEncoding` was replaced by `outputColorSpace`, `Texture.encoding` by `Texture.colorSpace`, and `ColorManagement.enabled` became `true` by default.
- **Render-target output.** When rendering into a non-XR render target, shaders output `ColorManagement.workingColorSpace` (linear) (`WebGLPrograms.js` line 213). For 8-bit RGBA textures whose `colorSpace` has sRGB transfer, `WebGLTextures.js` picks the `SRGB8_ALPHA8` internal format. That is why `webgl_portal` sets `rt.texture.colorSpace = renderer.outputColorSpace`: storage is sRGB-encoded for 8-bit precision and decoded when sampled. (The source lines are verified; the "encode on write, decode on sample" semantics are standard WebGL2/GLES3 behaviour, not separately verified here.)
- **Tone mapping.** Inline `renderer.toneMapping` applies only when rendering to screen (Migration Guide r154 to r155).
- **Lights:**
  - `useLegacyLights` and `physicallyCorrectLights` appear **nowhere** in r186 `src`, so they have been removed.
    - Migration Guide r154 to r155: "`WebGLRenderer.useLegacyLights` is now set to `false` by default and deprecated" (forum: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733, [SEARCH-ONLY]).
    - The guide's "legacy code is removed after ten releases" policy, plus the source grep, implies removal by r165. The guide has no explicit removal line.
  - `PointLight(color, intensity = 1, distance = 0, decay = 2)`. Intensity is "measured in candela (cd)", and the `power` getter/setter is in lumens: `power = 4*pi*intensity`.
  - `SpotLight(color, intensity=1, distance=0, angle=PI/3, penumbra=0, decay=2)`, intensity in cd, `power = pi*intensity`.
  - `RectAreaLight` intensity is in nits.
  - `DirectionalLight`, `AmbientLight` and `HemisphereLight` have intensity with no unit stated in the JSDoc.

### (i) Import map pattern

- **Example pages** (r186 `webgl_portal.html`):
  ```html
  <script type="importmap">
    { "imports": { "three": "../build/three.module.js", "three/addons/": "./jsm/" } }
  </script>
  ```
  ```js
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  ```
- **Manual, CDN form** (https://threejs.org/manual/pages/installation.html [READ]):
  ```html
  "three": "https://cdn.jsdelivr.net/npm/three@<version>/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@<version>/examples/jsm/"
  ```
  - The manual says to replace `<version>` with an actual release.
  - Both `https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js` and `.../examples/jsm/utils/CameraUtils.js` return HTTP 200.
  - Note that `https://threejs.org/manual/en/installation.html` returns 404; the `manual/pages/` path is the live one.
- **npm `package.json` exports:** `"./addons": "./examples/jsm/Addons.js"`, `"./addons/*": "./examples/jsm/*"`, `"./webgpu"`, `"./tsl"`.
- **WebGPU examples** add `"three/webgpu": "../build/three.webgpu.js"` and `"three/tsl": "../build/three.tsl.js"`.

### (j) PointerLockControls (`examples/jsm/controls/PointerLockControls.js`)

- **API:**
  - Fields: `isLocked`, `minPolarAngle=0`, `maxPolarAngle=PI`, `pointerSpeed=1.0`.
  - Methods: `connect(element)`, `disconnect()`, `dispose()`, `getDirection(v)`, `moveForward(d)`, `moveRight(d)`, `lock(unadjustedMovement=false)`, `unlock()`.
  - Events: `'change'`, `'lock'`, `'unlock'`.
- **Behaviour:**
  - `lock()` calls `domElement.requestPointerLock({ unadjustedMovement })` without awaiting it.
  - The mouse-move handler applies `movementX/Y` to a `'YXZ'` Euler on `camera.quaternion`.
- **Recent change.** Migration Guide r167 to r168: `PointerLockControls.getObject()` was removed; use `controls.object`.

---

## 3. Valve / Portal technical references

### 3.1 Portal (2007) developer commentary - transcripts by David Kircher

- **Source:** Portal Wiki, "Portal developer commentary", https://theportalwiki.com/wiki/Portal_developer_commentary. **[READ]** The HTML was fetched on the second try; the first two tries got HTTP 429.
- The transcripts are fan-transcribed from the in-game commentary nodes.
- Verbatim excerpts:

| Chamber | Topic | Excerpt |
|---|---|---|
| Test Chamber 03 | Rendering | "When rendering the player's view through a portal, we must render a separate image using a virtual camera which looks out of the opposite portal. To obtain a correct image and efficient rendering performance, we render only what is visible through the limited field of view of the opposite portal and exclude objects which lie between the virtual camera and the plane of the opposite portal." |
| Test Chamber 04 | Physics | "Integrating portals with the Source engine's physics system was a complex process..." The physics system had to allow "dynamic changes to its representation of colliding geometry". The first versions took "up to one half of one second, or 500 milliseconds". The final design "creates temporary hybrid physics environments in bubbles around the portals using less accurate collision than that produced by Source's standard collision generation", reducing the cost "from 500 milliseconds to just 10 milliseconds". |
| Test Chamber 08 | Moving objects | "We solve the problem of colliding with these dynamic objects by cloning the objects from one portal to the other and strictly controlling what objects are allowed to collide with each other and how they're allowed to collide." |
| Test Chamber 09 | Render path | Early builds "rendered the views through portals to two offscreen textures". That was "incompatible with antialiasing and consumed a large amount of video memory". They "switched to a system which renders portal views recursively into the frame buffer with the aid of the stencil buffer to isolate pixels corresponding to a given portal". |
| Test Chamber 14 | Recursion | "we support a maximum of nine recursive portal views down any chain of portals. We achieve the impression of infinite recursion by copying part of the previously rendered frame onto the final portal in the recursive chain." |

### 3.2 "Portal Problems" - Valve engineers' lecture (CS50 GD50, 2018)

- **Lecture.** CS50's Introduction to Game Development 2018, Lecture 11, "Portal Problems". **Speakers per the slide title page: "Dave Kircher & Tejeev Kohli"** (contacts dave@valvesoftware.com and tejeev@valvesoftware.com). Subtitle: "Development hurdles in Rendering, Design, & Physics".
  - Video: https://www.youtube.com/watch?v=ivyseNMVt-4. The YouTube oEmbed title is "Portal Problems - Lecture 11 - CS50's Introduction to Game Development 2018", author "CS50". [title verified; video not watched]
  - Slides PDF: https://cdn.cs50.net/games/2018/spring/lectures/11/lecture11.pdf [READ]. Most slides are images, so only the text headings were extractable.
  - Notes: https://cs50.harvard.edu/games/2018/notes/11 [READ-SUMMARY]. Week page with links: https://cs50.harvard.edu/games/2018/weeks/11/ [READ-SUMMARY]. The course is archived ("retired on 30 June 2024").
  - Third-party transcript: https://rosetta.to/u/cs50/portal-problems-lecture-11-cs50-s-introduction-to-game-development-2018 [READ-SUMMARY; secondary]. It misspells Kohli as "Tajik"; the slides are authoritative.
- **Verbatim slide text:**
  - Agenda topics:
    - Rendering: "Texture vs Stencil Tradeoffs", "Rendering is 1:1", "Rendering using stencils", "Duplicate Models", "Clip Planes", "Banana Juice", "Recursion", "Third Person Gotchas", "Pixel Queries".
    - Physics: "Triggers and Vectors and Planes, Oh My", "Carving Holes", "Collision Lists", "Shadow Clones".
    - Misc: "Camera interpolation", "Discontinuous interpolation", "Moving portals", "Frustums", "Non-rotating player bounding box", "Unstuck", "Binary gravity".
  - Portal definition: "A discontinuity in 3D space where the back face of a 2D rectangle is defined to be the front face of another 2D rectangle located elsewhere."
  - Texture approach:
    - "Separate textures per portal view. Recursion gets big fast."
    - "Use Painter's Algorithm. Deepest portals first"
    - "Can't effectively use antialiasing. Small visual artifacts."
    - "Simplest to implement when constrained to a depth of 1"
  - Stencil approach:
    - "Renders entire frame in the back buffer. No texture memory needed."
    - "Start from the main view and recurse as necessary."
    - "Homogenous visual quality"
    - "Need to recurse after opaques, but before transparencies."
  - Banana Juice: "When rendering a portal view. Objects between the virtual camera and the exit portal can occlude the view."
  - Physics: "Touch volumes for physics objects", "Planes and quads for rays", "Uses ray test when object origin crosses the portal plane".
  - Non-rotating bounding box: "Axis Aligned Bounding Box doesn't look the same after some rotations. So we force the player to duck for a nearly cubical shape."
  - Unstuck: "Sometimes the player bounding box teleports into another bounding box and the movement system needs a little help." Also: "We sweep a bunch of smaller boxes from extent to extent inside the player box to figure out which way is the most unobstructed."
- **Spoken details** (from the third-party transcript; secondary):
  - **Stencil passes.**
    - Stencil is cleared with depth.
    - The portal opening is drawn with stencil increment.
    - A full-screen quad at maximum depth "punches a hole" in depth.
    - The scene is redrawn from the transformed camera where stencil matches, then the stencil is decremented and depth restored.
  - **Banana juice fix.** "we just clip the entire world behind the portal plane", using a clip plane on the virtual view.
  - **Duplicate models.** Rendering geometry is copied to the other portal every frame and clipped to the portal half-space.
  - **Recursion.** Deep levels are faked by reusing the previous level's image, which stretches and pops. "we found it was best to just limit to two recursions". This differs from the Portal (2007) commentary's "maximum of nine"; the lecture likely refers to later hardware or targets, which is unverified.
  - **Physics.** Volumes in front of the portal, with objects in the inner volume colliding against a locally **carved copy** of nearby static geometry ("we don't do this for the entire world because that takes way too long").
  - **Rays.** Rays crossing a portal are split into two segments.
  - **Physics "shadow clones".** "we're not allowed to actually teleport it from one frame to the next". A shadow on the other side is driven toward a target pose with forces, and the "master" is the side containing the object's origin.
  - **Movement tuning.** Exit velocity gets a minimum ("Fun > Accurate physics"), and floor or ceiling portals have "funnel" helpers.

### 3.3 Postmortem (Game Developer magazine, January 2008)

- **Source.** "Exclusive: Inside The Making Of Portal", Gamasutra/Game Developer, January 10, 2008. It excerpts the Game Developer magazine postmortem by **Kim Swift, Erik Wolpaw and Jeep Barnett** (Valve). https://gamedeveloper.com/game-platforms/exclusive-inside-the-making-of-i-portal-i- [READ-SUMMARY]
- **Points:**
  - "we implemented a stencil buffer drawing method for portal views".
  - "This allowed us to render an infinitely deep number of portals (limited only by performance)".
  - "special view frustum culling based on the portal's edges".
  - "distance is relative to the portal locations": LOD, line of sight and precomputed visibility had to account for portals.

### 3.4 Other Valve items checked

- **GDC 2008 "Portal" postmortem** (Kim Swift & Erik Wolpaw). It focused on narrative and design, not tech; per Engadget, https://www.engadget.com/2008-02-22-gdc08-live-from-the-portal-post-mortem.html [SEARCH-ONLY].
- **"Portal: The Science Behind".** **No evidence this exists**; a web search returned nothing with that title. **Not cited.**
- **Valve Developer Community** `prop_portal` (https://developer.valvesoftware.com/wiki/Prop_portal) and "Portals" pages. [NOT ACCESSIBLE]: WebFetch got 403 and curl hit an Anubis bot-check page. Search snippets show entity docs (Fizzle, SetActivatedState inputs, portal pair ID); not technical rendering material.
- **Pixar, "Portals in Incredibles 2"** (graphics.pixar.com/library/PortalsIncredibles2/paper.pdf). [NOT ACCESSIBLE]: it redirects to Pixar's generic "Technology Libraries" page. A search snippet says the two copies of geometry are constrained "to maintain a continuous boundary". Not verified, not cited.
- **Narbacular Drop** (DigiPen, 2005) is the predecessor. Per the CS50 transcript, it used render-to-texture portals. https://en.wikipedia.org/wiki/Narbacular_Drop [SEARCH-ONLY].

---

## 4. Open implementations and tutorials

### 4.1 Sebastian Lague - "Coding Adventure: Portals" (YouTube) and `SebLague/Portals`

The year 2020 comes from the repo's licence copyright line; the video's publish date was not checked.

- **Sources:**
  - Video: https://www.youtube.com/watch?v=cWpFZbjtSQg. The oEmbed title is "Coding Adventure: Portals", author "Sebastian Lague"; the README links it. [title verified]
  - Repo: https://github.com/SebLague/Portals. Description "Portals in Unity", default branch `master`.
  - **License: MIT**. The `License` file reads "MIT License / Copyright (c) 2020 Sebastian Lague". [READ]
- **Files read** (raw.githubusercontent.com): `Assets/Scripts/Core/{Portal.cs, PortalTraveller.cs, MainCamera.cs, CameraUtility.cs}`, `Assets/Scripts/Core/Shaders/{Portal.shader, Slice.shader}` and `Assets/Scripts/Demo/{PortalPhysicsObject.cs, FPSController.cs}`.
- **Rendering: render texture plus screen-space UVs.**
  - Each portal has a disabled camera rendering into a screen-sized `RenderTexture`, which is assigned to the linked portal's screen material.
  - `Portal.shader` samples `tex2D(_MainTex, i.screenPos.xy / i.screenPos.w)` using `ComputeScreenPos`. A `displayMask` int switches to an "inactive colour".
- **Recursion:**
  - `recursionLimit = 5`.
  - Camera matrices are computed by repeatedly applying `transform.localToWorldMatrix * linkedPortal.transform.worldToLocalMatrix * m`.
  - Rendering goes from the deepest level to the shallowest into the **same** texture, so each level sees the previous one.
  - Recursion stops early when the screen-space bounds of the two portal screens do not overlap (`CameraUtility.BoundsOverlap`).
  - The pass is skipped entirely if the linked screen is outside the player frustum (`GeometryUtility.TestPlanesAABB`).
- **Oblique near plane.**
  - `SetNearClipPlane()` comments "Learning resource: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf".
  - It builds a camera-space plane `(n, -dot(p,n) + nearClipOffset)` and uses Unity's `playerCam.CalculateObliqueMatrix(clipPlaneCameraSpace)`.
  - It skips the oblique matrix when `|camSpaceDst| <= nearClipLimit` ("can cause some visual artifacts").
  - A comment warns that it "affects precision of the depth buffer, which can cause issues with effects like screenspace AO".
- **Camera near plane inside the portal.** `ProtectScreenFromClipping()` gives the portal screen box a thickness equal to the distance from the eye to a near-plane corner, `|(halfWidth, halfHeight, near)|`. It is offset to the side away from the viewer, so the near plane never cuts through the screen.
- **Traversal:**
  - A traveller teleports when `sign(dot(pos - portal.pos, portal.forward))` changes between frames.
  - The new pose comes from `m = linked.localToWorldMatrix * this.worldToLocalMatrix * traveller.localToWorldMatrix`. There is **no 180-degree flip**: in this project the exit side is the linked portal's back side (see section 6).
  - Rigidbody velocity and angular velocity are transformed with `toPortal.TransformVector(fromPortal.InverseTransformVector(v))`.
  - The FPS controller applies only the yaw delta (`Mathf.DeltaAngle`), transforms velocity, then calls `Physics.SyncTransforms()`.
- **Clones and slicing:**
  - A graphics clone is created on entering the trigger and positioned with the same `m` each frame.
  - `Slice.shader` discards fragments with `clip(dot(worldPos - (sliceCentre + sliceNormal*sliceOffsetDst), sliceNormal))`. Here `sliceNormal` points out of the side that should be hidden.
  - Offsets of ±screen thickness, or ±1000, handle seams and slivers per camera pass (`HandleClipping`).

### 4.2 Daniel Ilett - "Portals" tutorial series (Unity, Dec 2019 - Jan 2020)

- **Index page:** https://danielilett.com/2019-12-01-tut4-intro-portals/ [READ]
- **Parts** (all [READ]):

  | Part | Topic | URL |
  |---|---|---|
  | 1 | "Spyro Skyboxes" | https://danielilett.com/2019-12-11-tut4-1-spyro-skyboxes/ (not read) |
  | 2 | "Portal Rendering": camera positioning, stencil rendering | https://danielilett.com/2019-12-14-tut4-2-portal-rendering/ |
  | 3 | "Matrix Clipping": oblique near-plane projection | https://danielilett.com/2019-12-18-tut4-3-matrix-matching/ |
  | 4 | "Portal Momentum": physics | https://danielilett.com/2020-01-03-tut4-4-portal-momentum/ |
  | 5 | "Placing Portals": raycasting, rotations | https://danielilett.com/2020-01-12-tut4-5-placing-portals/ |
  | 6 | "Portal Recursion": recursion, screen-space sampling | https://danielilett.com/2020-01-19-tut4-6-portal-recursion/ |

- **Code:** https://github.com/daniel-ilett/shaders-portal, **MIT License, Copyright (c) 2019 Daniel Ilett** [READ: LICENSE and README]. Built with Unity 2019.2.0f1.
- **Camera transform (Part 2), verbatim:**
  ```csharp
  Vector3 relativePos = inTransform.InverseTransformPoint(transform.position);
  relativePos = Quaternion.Euler(0.0f, 180.0f, 0.0f) * relativePos;
  portalCamera.transform.position = outTransform.TransformPoint(relativePos);
  Quaternion relativeRot = Quaternion.Inverse(inTransform.rotation) * transform.rotation;
  relativeRot = Quaternion.Euler(0.0f, 180.0f, 0.0f) * relativeRot;
  portalCamera.transform.rotation = outTransform.rotation * relativeRot;
  ```
- **Stencil (Part 2, non-recursive).**
  - The portal surface shader writes a per-portal `_MaskID` (`Comp Always`, `Pass Replace`).
  - A post-process blit copies the virtual camera's screen-sized `RenderTexture` only where the stencil equals that ID.
  - He notes that depth and stencil share a buffer and that "bit-depths of 16 or below store depth only, no stencil".
- **Oblique projection (Part 3).**
  - First shows why setting `nearClipPlane` to the distance fails: that plane is perpendicular to the view direction.
  - Then builds `Plane p = new Plane(-outTransform.forward, outTransform.position)` and transforms `(n, distance)` by `Transpose(Inverse(worldToCameraMatrix))`.
  - Finally uses `mainCamera.CalculateObliqueMatrix(...)`, computed from the main camera so an oblique matrix is never compounded across frames.
- **Momentum and collision (Part 4):**
  - `halfTurn = Quaternion.Euler(0,180,0)` is applied to position, rotation and `rigidbody.velocity` (via `TransformDirection`). Objects keep "local momentum".
  - Objects warp when the portal-local `z > 0`.
  - To let objects through the wall, `Physics.IgnoreCollision(objectCollider, wallCollider)` is set while the object is in the portal trigger, and reset on exit. The tutorial notes that cutting a hole in the wall's collision mesh at runtime would be more "realistic" but complicated.
  - Large objects are blocked by a **non-trigger collider frame around the portal**.
  - A **visual clone** (mesh and materials only) is placed with the same transform in `LateUpdate`.
  - The player is turned upright after a warp with `Quaternion.LookRotation(transform.forward, Vector3.up)` and slerped toward it.
- **Placement (Part 5):**
  - Raycast against a layer mask, with portal forward `= -hit.normal` (into the wall).
  - Portal right is snapped to the nearest cardinal axis, `up = -Cross(right, forward)`, then `LookRotation(forward, up)`.
  - The portal is offset 0.001 from the wall to avoid z-fighting.
  - `FixOverhangs` and `FixIntersects` nudge the portal using four edge raycasts plus `Physics.CheckSphere`.
  - Optionally, portals can be shot *through* portals by re-casting the ray with the same 180-degree transform, as in Narbacular Drop.
- **Recursion (Part 6).**
  - Switches from stencils to **screen-space sampling** of a screen-sized texture.
  - Iterations (`iterations = 7`) are rendered **deepest first** into the portal's texture, so each capture sees the previous one.

### 4.3 Wikibooks - "OpenGL Programming/Mini-Portal" series (C++/GLM/OpenGL; CC BY-SA)

- **Pages** (all [READ], via `action=raw`):
  - https://en.wikibooks.org/wiki/OpenGL_Programming/Mini-Portal
  - https://en.wikibooks.org/wiki/OpenGL_Programming/Mini-Portal_Smooth
  - https://en.wikibooks.org/wiki/OpenGL_Programming/Mini-Portal_Recursive
  - https://en.wikibooks.org/wiki/OpenGL_Programming/Mini-Portal_Optimization
- **View matrix through a portal**, verbatim:
  ```cpp
  glm::mat4 portal_view(glm::mat4 orig_view, Mesh* src, Mesh* dst) {
    glm::mat4 mv = orig_view * src->object2world;
    glm::mat4 portal_cam =
      // 3. transformation from source portal to the camera - it's the
      //    first portal's ModelView matrix:
      mv
      // 2. object is front-facing, the camera is facing the other way:
      * glm::rotate(glm::mat4(1.0), glm::radians(180.0f), glm::vec3(0.0,1.0,0.0))
      // 1. go the destination portal; using inverse, because camera
      //    transformations are reversed compared to object
      //    transformations:
      * glm::inverse(dst->object2world)
      ;
    return portal_cam;
  }
  ```
- **Single-portal stencil:**
  ```
  glStencilFunc(GL_NEVER, 0, 0xFF); glStencilOp(GL_INCR, GL_KEEP, GL_KEEP)   // draw portal
  glStencilFunc(GL_LEQUAL, 1, 0xFF)                                         // draw portal view
  ```
  The portal is then drawn into the depth buffer only (colour mask off) so the main pass does not overwrite it.
- **Warp.** A line (previous to current camera position) vs portal-triangle intersection solved for `(t,u,v)`, with `1e-6` tolerances. On a hit, `camera = portal_view(camera, &portals[i], &portals[(i+1)%2])`.
- **"Smooth": the flicker when crossing.**
  - Cause: the camera is within `zNear` of the portal, so the near plane is already behind it.
  - The fix is a **volumetric portal**: extra geometry from the portal plane back by `dz = max(zNear/cos(fovx), zNear/cos(fovy))`, so the stencil is still written once the near plane passes the portal face.
  - It also suggests a small `zNear` such as 0.01, warning about depth precision if it is too small.
- **"Recursive."** The stencil is built incrementally by drawing the outer portal with `GL_INCR`, the sub-portal with `GL_INCR`, then the outer portal again with `GL_DECR`. Values ≥ 1 mark the intersection. Restoring by readback is noted as not possible on GLES2.
- **"Optimization."** Scissors give a rough clip first and let recursion stop early when a sub-portal is fully hidden.

### 4.4 Thomas Rinsma - "Rendering recursive portals with OpenGL" (th0mas.nl, 2013-05-19)

- **Source:** https://th0mas.nl/2013/05/19/rendering-recursive-portals-with-opengl/ [READ]
- **Virtual camera.** "Take the distance and angle (the transformation matrix) from the camera to the source portal and apply the inverse of that to the destination portal". The problem of blocking objects between the virtual camera and the destination portal is solved by "oblique view frustum near-plane clipping", linking terathon's `oblique.html`.
- **Render to texture (FBO)** is rejected because of texture resolution close up and GPU memory under recursion.
- **13-step stencil recipe for one portal:**
  1. Stencil `GL_INCR` on `sfail` with `GL_NEVER`.
  2. Draw the portal frame.
  3. Draw the virtual scene with `GL_LEQUAL` reference 1.
  4. Clear depth.
  5. Draw the portal frame into depth only.
  6. Draw the main scene.
- **Recursion.** The stencil value equals the recursion depth n. The deepest level is drawn first, back up to zero. Overlapping sub-portals need the stencil test enabled while writing the stencil.
- **Valve claim.** "to my knowledge, Valve used a combination ... stencil buffer method [for the] first couple of recursions while using the render-to-texture method for deeper recursion levels". This is the author's belief, not a Valve statement; the commentary in section 3.1 says the final level copies part of the previous frame.
- **Code** (linked, not inspected): https://github.com/ThomasRinsma/opengl-game-test.

### 4.5 Immersive Portals (Minecraft mod) - implementation notes

- **Source:** "Implementation Details | Immersive Portals", https://qouteall.fun/immptl/wiki/Implementation-Details [READ-SUMMARY]
- **Rendering.** Stencil, outer to inner, one stencil layer per level, depth cleared before the destination is drawn, with a recursion limit.
- **Clipping.** Front clipping uses `gl_ClipDistance`. Oblique projection was rejected because it "works poorly with pixel-depth-dependent effects".
- **Near-camera fix.** `GL_DEPTH_CLAMP` is enabled when drawing portal shapes near the camera.
- **Teleport timing.** Client-side, before each frame, triggered by the *camera* crossing the portal plane.
- **Entities.** Entities intersecting a portal are drawn twice with a culling plane.
- **Collision.** Boxes behind the portal or destination are ignored, and the two constraints are merged.

### 4.6 Technique comparison (summary of the above)

| Technique | Who uses it | Pros | Cons |
|---|---|---|---|
| Render target sampled with **screen-space UVs** (`gl_FragCoord` / `screenPos.xy/w`) | Lague; Ilett Part 6 | Simple. Recursion by rendering deepest first into the same texture. No stencil needed. | Extra full-screen render target per portal. Texture resolution must match the screen. |
| Render target with **off-axis projection** (`frameCorners`) and normal UVs | three.js `webgl_portal` | Texture maps 1:1 to the quad. A small render target is possible. | Recursion is only one frame late. Pixelates close up. Needs clipping of objects behind the exit portal. |
| **Stencil**, recursive in the default framebuffer | Valve Portal; Rinsma; Wikibooks; Ilett Part 2 (non-recursive); ImmPtl | No extra memory. Works with MSAA. Uniform quality. | Needs `stencil:true`, careful draw order, `autoClear=false`, depth-clear tricks, and opaques before transparents. |

- **Removing geometry between the virtual camera and the exit portal:**
  - Oblique near plane: Lengyel; Lague; Ilett; Rinsma; three.js `Reflector.js`.
  - Clip planes: Valve's "banana juice" fix; ImmPtl `gl_ClipDistance`; three.js `Material.clippingPlanes` (fragment discard).
  - An off-axis near plane at the portal plane: possible with `frameCorners` plus `near ≈ d` (inference).
- **Near plane crossing the portal:**
  - Thicken the portal into a box or volume (Wikibooks "volumetric portal"; Lague `ProtectScreenFromClipping`).
  - Depth clamp (ImmPtl).
  - Teleport triggered by the camera crossing, not the body.
  - Teleporting early when within `zNear` does not help when strafing (Wikibooks).
- **Objects straddling a portal:**
  - Visual clone plus slicing by the portal plane (Lague `Slice.shader`; Ilett clone; Valve "Duplicate Models" plus "Clip Planes").
  - Physics: disable collision with the host wall while in the portal trigger, plus a solid frame collider (Ilett).
  - Physics: carved local collision copy plus "shadow clones" driven by forces (Valve).

---

## 5. Physics references

### 5.1 Glenn Fiedler - "Fix Your Timestep!" (Gaffer On Games, Jun 10, 2004)

- **Source:** https://gafferongames.com/post/fix_your_timestep/ [READ]
- **Fixed-dt accumulator:**
  - "the renderer produces time and the simulation consumes it in discrete dt sized steps".
  - Loop: `accumulator += frameTime; while (accumulator >= dt) { integrate(state, t, dt); accumulator -= dt; t += dt; }`.
- **Interpolation.** `alpha = accumulator / dt`, then `state = currentState*alpha + previousState*(1-alpha)`. Orientation is slerped as a quaternion.
- **Clamp.** `frameTime` is clamped: `if (frameTime > 0.25) frameTime = 0.25`.
- **"Spiral of death."** It happens when the simulation cannot keep up. The remedies are headroom or "clamp at a maximum # of steps per-frame".
- **Portal implication (inference).** A teleport is a discontinuity. Interpolating previous to current across a teleport smears the object across the level. Either transform `previousState` through the portal too, or skip interpolation on that step. Valve's slides list "Discontinuous interpolation" and "Camera interpolation" as topics.

### 5.2 Semi-implicit (symplectic) Euler - energy behaviour

- **Glenn Fiedler, "Integration Basics" (Jun 1, 2004).** https://gafferongames.com/post/integration_basics/ [READ]
  - "Most commercial game physics engines use this integrator."
  - Update order: `velocity += acceleration * dt; position += velocity * dt;`.
  - "Even though semi-implicit euler has the same order of accuracy as explicit euler (order 1), we get a much better result ... because it is symplectic."
  - Explicit Euler on a spring "gains energy over time".
  - With large dt, RK4 "maintains the correct frequency but loses energy", while semi-implicit Euler "does a better job at conserving energy, on average" but "drifts out of phase".
  - His recommendation: semi-implicit Euler.
- **Wikipedia, "Semi-implicit Euler method".** https://en.wikipedia.org/wiki/Semi-implicit_Euler_method [READ-SUMMARY]
  - First-order; "a symplectic integrator".
  - "almost conserves the energy (when the Hamiltonian is time-independent)".
  - For the linear spring it exactly preserves a modified energy, which gives stable periodic orbits for small enough dt.
  - Its "Setting" section is tagged [citation needed].
- **Primary academic source.** E. Hairer, C. Lubich, G. Wanner, "Geometric numerical integration illustrated by the Störmer-Verlet method", *Acta Numerica* 12 (2003) 399-450, doi:10.1017/S0962492902000144. Free preprint: https://www.unige.ch/~hairer/preprints/gniverlet.html [SEARCH-ONLY: abstract via search]. The abstract credits backward error analysis for "long-time energy conservation" of the method. The PDF was not read in full.

### 5.3 Christer Ericson - *Real-Time Collision Detection* (Morgan Kaufmann, 2005)

- **Bibliographic details.** ISBN 9781558607323, 632 pp. Now listed by CRC Press/Routledge (https://www.routledge.com/Real-Time-Collision-Detection/Ericson/p/book/9781558607323) [READ-SUMMARY: table of contents only]. The British Library record lists Elsevier/Morgan Kaufmann, ©2005. **The book text was not accessed.**
- **Sections relevant to a portal simulator** (titles from the publisher's table of contents):
  - **5.1.1** Closest Point on Plane to Point.
  - **5.1.4.2** Closest Point on 3D Rectangle to Point. Use for a rectangular portal frame.
  - **5.2.2** Testing Sphere against Plane.
  - **5.2.8** Testing Sphere against Polygon.
  - **5.3.1** Intersecting Segment against Plane. Use for portal crossing between steps.
  - **5.3.7** Intersecting Ray or Segment against Cylinder.
  - **5.5.3** Intersecting Moving Sphere against Plane. Use for continuous crossing and tunnelling.
  - **7.6** "Cells and Portals". This means *visibility* portals, not teleporting portals.
  - **11.3.2** Robustness through Thick Planes.
- **No circle or torus closest-point section appears in the table of contents.** Use Eberly below for the circular rim.
- **Standard formulas** (textbook math, not quoted from the book). For a plane `n.X = d` with unit n:
  - Signed distance `s = n.P - d`.
  - Closest point `P - s n`.
  - A sphere (centre c, radius r) intersects the plane iff `|n.c - d| <= r`.

### 5.4 Closest point on a circle (circular or elliptical portal rim) - David Eberly

- **Source.** D. Eberly, "Distance to Circles in 3D", Geometric Tools, created May 31, 2015, last modified Aug 25, 2024, CC BY 4.0. https://www.geometrictools.com/Documentation/DistanceToCircle3.pdf [READ]
- **Section 2, Distance Between a Point and a Circle.** The circle is {centre C, unit normal N, radius r}; P is the point and `Δ = P - C`.
  - (1) `Q - C = Δ - (N.Δ)N`, where Q is the projection of P onto the circle's plane.
  - (2) `K = C + r (Q - C)/|Q - C|`, the closest circle point, unique when P is not on the normal line.
  - (4) `|Q - C| = |N x Δ|`.
  - (5) `|P - K|^2 = (N.Δ)^2 + (|N x Δ| - r)^2 = |Δ|^2 - 2r|N x Δ| + r^2`.
  - When P is on the axis (`N x Δ = 0`), every circle point is equidistant, at `|P-K|^2 = |Δ|^2 + r^2`.
  - The document discusses robust floating-point handling near the axis.
- **Sphere-vs-rim test (derived).** The rim region is a solid torus (major radius r, tube radius ρ). A sphere of radius R at P touches it iff `|P - K| <= R + ρ`. The contact normal is `(P - K)/|P - K|`.

---

## 6. Rigid transform between portal frames

**Formula.** Let `M_A`, `M_B` be the portals' world matrices (rigid, no scale), with local +z as the normal and the same convention for both portals. Entering the front of A and exiting the front of B gives:

```
T = M_B * R_y(pi) * M_A^-1,     R_y(pi) = diag(-1, 1, -1)   (rotation by pi about the portal's local up axis)
```

- **Positions** (w = 1): `p' = T p`.
- **Orientations:** `q' = q_B * q_y(pi) * q_A^-1 * q`.
- **Directions, velocities and angular velocities:** apply only the rotation part, `R_B R_y(pi) R_A^T`.
- **Camera world matrix:** `C' = T C`.
- **View matrix:** `V' = V M_A R_y(pi) M_B^-1`. This uses `R_y(pi)^-1 = R_y(pi)`.

**Published statements of the formula** (all [READ]):

1. **Wikibooks Mini-Portal `portal_view`** (section 4.3). It gives the view-matrix form `V' = V * src->object2world * rotate(180 deg, Y) * inverse(dst->object2world)`, so the camera world matrix is `M_dst R_y(pi) M_src^-1 C`. The same function moves the camera on warp.
2. **Daniel Ilett, Part 2 (camera) and Part 4 (objects and velocity).** `TransformPoint_out( Euler(0,180,0) * InverseTransformPoint_in(p) )`, plus `out.rotation * Euler(0,180,0) * Inverse(in.rotation) * rot` and the same pattern with `TransformDirection` for velocity. His portal forward is `-hit.normal` (into the wall) for both portals, and the half-turn still applies because the convention is shared.
3. **three.js `webgl_portal.html`.** `worldToLocal(this)`, then negate x and z, then `localToWorld(other)`; this equals `M_other * R_y(pi) * M_this^-1` for the camera position.
4. **Counter-example on convention: Lague.** He uses `T = M_linked * M_this^-1` **without** the flip, because his portal pair treats the linked portal's back face as the exit (teleport on a sign change of the local-z offset). The flip is a convention choice. It is needed exactly when both portals' local +z (or both -z) point out of their walls, as when the normal is taken from a raycast hit.

**Notes (inference):**
- Use a proper rotation, R_y(pi), with determinant +1. A mirror such as `diag(1,1,-1)` flips handedness and would invert triangle winding (ImmPtl notes winding flips for *mirrors*).
- For the player, re-derive an upright orientation after the transform. Ilett uses `LookRotation(forward, worldUp)` plus slerp; Lague transfers only the yaw delta.
- For non-rigid portal matrices (scale), three.js `Camera.updateMatrixWorld` strips scale from the view matrix. Build T from position and quaternion only.

---

## 7. Browser input APIs (MDN)

All of the following returned HTTP 200 and were [READ] (key sections).

- **Pointer Lock API.** https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API. MDN marks it "Limited availability" (not Baseline).
  - Gives "raw mouse movement", hides the cursor and is not limited by screen edges.
  - There is a section on handling promise and non-promise versions of `requestPointerLock()`.
- **`Element.requestPointerLock()`.** https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
  - `requestPointerLock(options)` with `unadjustedMovement` (default false; true disables OS mouse acceleration).
  - The Promise-returning version "is not yet a standard and is not implemented by all browsers".
  - Requires **transient activation**. It fails if called immediately after the user exits via the default unlock gesture. Call it before `requestFullscreen()`.
  - Iframes need `allow-pointer-lock`.
  - MDN's sample falls back to plain `requestPointerLock()` on `NotSupportedError`.
- **Related lock members:**
  - `Document.exitPointerLock()`: https://developer.mozilla.org/en-US/docs/Web/API/Document/exitPointerLock
  - `Document.pointerLockElement`: https://developer.mozilla.org/en-US/docs/Web/API/Document/pointerLockElement
  - `pointerlockchange`: https://developer.mozilla.org/en-US/docs/Web/API/Document/pointerlockchange_event
  - `pointerlockerror`: https://developer.mozilla.org/en-US/docs/Web/API/Document/pointerlockerror_event
- **`MouseEvent.movementX`.** https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/movementX. MDN shows "Baseline 2026". Units vary: "physical pixel, a logical pixel, or a CSS pixel" depending on browser and OS.
- **Gamepad API** ("Baseline, Widely available"):
  - https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
  - "Using the Gamepad API": https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
    - `gamepadconnected` and `gamepaddisconnected` events fire on `window`. If a pad is already connected, `gamepadconnected` fires only after a button press or axis move.
    - "you should poll Navigator.getGamepads() and read the current object for a known index each frame".
    - `axes` range from -1.0 to 1.0.
    - `mapping === "standard"` means the standard layout.
  - `Navigator.getGamepads()`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads. It throws `SecurityError` when blocked by a Permissions Policy.
  - `Gamepad.mapping`: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
- **Keyboard:**
  - `KeyboardEvent.code`: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code. It is the physical key and "isn't altered by keyboard layout", so use it for WASD (`"KeyW"`; on AZERTY the same physical key). MDN marks it "Limited availability".
  - `KeyboardEvent.key`: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
- **Timing helpers:**
  - `requestAnimationFrame`: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
  - `performance.now()`: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
  - `visibilitychange`, for pausing the fixed-step accumulator: https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event

---

## 8. Numeric verification log (oblique projection in three.js r186)

**Setup.** Script `scratchpad/verify/oblique-check.mjs`, importing `three@0.186.1` `build/three.module.js`.
- Camera: `PerspectiveCamera(60, 1.5, 0.1, 100)`.
- Camera-space plane `C = (0.2822, -0.1881, -0.9407, -4.8071)`, so `Cw < 0`.

**[A] WebGL [-1,1] - Lengyel's shortcut (Reflector.js indices, clipBias 0) vs the general eq. 7-10:**
- Agreement: max |difference| = 1.8e-15. `sgn(C')` equals `sgn(C)` for x and y.
- The shortcut `q` is the eq. 15 Q, with `q_z = -1` and `q_w = 1/f = 0.01`.
- Points on C map to NDC z = -1.000000.
- A point on the camera side maps to z = -1.177, so it is clipped. A point beyond C maps to -0.533.
- The far corner Q maps to +1.000000.
- Rows 1, 2 and 4 are unchanged.
- Eq. 16 reproduced: z-term -1.061856 = -(f+d)/(f-d), and w-term -6.185567 = -2fd/(f-d).

**[B] WebGPU [0,1], the ReflectorNode branch** (`scale 1/(C.q)`, no `+1`):
- `q_w = 1/f`.
- Points on C map to z = 0, and Q maps to 1.

**[C] ReflectorNode r186 WebGL branch** (`scale 1/(C.q)` with `+1`):
- Points on C map to z = -1, so the near plane is correct.
- Q maps to 0, not 1, so the far plane is not optimal.

**[D] Reversed depth (derived: `M'3 = M4 - aC`, `a = (M4.Q)/(C.Q)`, `Q = M^-1(sgn,sgn,0,1)`):**
- The original matrix maps near to 1 and far to 0.
- Points on C map to 1, and Q maps to 0.

---

## 9. Not verified / open items

- *Game Programming Gems 5* §2.6 and *FGED Vol. 2*: not accessed.
- Kooima's original article: archive.org was unreachable.
- Hairer-Lubich-Wanner: read via abstract only.
- RTCD: the book text was not accessed; only the table of contents was.
- Sebastian Lague's and the CS50 videos: not watched. Video titles were verified via oEmbed; content comes from code, slides and a third-party transcript.
- Valve Developer Community wiki: blocked by a bot check.
- How three.js `logarithmicDepthBuffer` interacts with an oblique near plane: not tested.
- Whether r186 `PointerLockControls.lock()` should await or catch the Promise (`NotSupportedError` with `unadjustedMovement`): the code does not handle it; MDN shows the fallback pattern.
