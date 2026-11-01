# Iris (Vulkan fork) - terrain fix for GPUs without `VK_EXT_multi_draw`

A fixed build of [`laurensanp/iris-vulkan`](https://github.com/laurensanp/iris-vulkan) (branch `vulkan-m2`,
commit `6c390e5`, Minecraft 26.3, Sodium 0.9.x). The jar is the upstream source plus the patch next to it.
License: LGPL-3.0, like Iris.

| File | What it is |
|---|---|
| `iris-fabric-vulkan-mc26.3-fixed.jar` | Drop-in replacement for `iris-fabric-vulkan+mc26.3.jar`. |
| `iris-vulkan-fix.patch` | The whole source change (`git apply` it on `6c390e5`). |

## Install

Delete the old Iris jar from `mods/` first (both have the mod id `iris`, Fabric refuses duplicates), then put
`iris-fabric-vulkan-mc26.3-fixed.jar` in its place. The mod version string is unchanged on purpose.

## What was wrong

With a shader pack on, terrain was drawn as stretched, floating blocks (caves, tree trunks as black pillars,
pieces of hills hanging in the sky). Shaders off, or an NVIDIA card, looked fine.

Cause: GPUs that lack `VK_EXT_multi_draw` (the log line is `Optional FeatureSet [EXT MultiDraw] not supported`,
which is what AMD's Windows driver prints) make Sodium draw terrain through its *indirect* path. That path writes
every region's draw commands into one slot of a ring buffer per frame, and `RenderSectionManager.prepareRender()`
switches to the next slot. Per frame the order is:

1. Sodium writes the main pass's commands into slot A.
2. Iris renders the shadow pass, whose own `setupTerrain()` calls `prepareRender()` again and moves to slot B.
3. The main pass draws, reading slot B at the offsets it wrote in slot A: the shadow pass's commands and stale
   ones from earlier frames. Those index ranges belong to other sections, hence the shredded geometry.

The multi-draw path reads its commands from CPU memory, so it never noticed. It only happens while a shadow pass
runs, which is why it only showed up when a shader was turned on.

## Changes

* `MixinRenderSectionManagerShadow`: do not move to the next ring slot while the shadow pass runs. Both passes now
  share the frame's slot; their commands sit at different offsets.
* `IrisMixinPlugin`: the guard that turns stray OpenGL calls into no-ops on Vulkan is now installed whatever
  `options.txt` says. It used to need `preferredGraphicsBackend` to contain "vulkan", so with `"default"` and a
  game that ended up on Vulkan anyway, the first raw GL call aborted the JVM (`No context is current`). The guard
  checks at runtime that Vulkan is active, so on OpenGL it only costs a check.

## How it was checked

Built from source (JDK 25, Gradle) and run on Minecraft 26.3 under Xvfb with Mesa's software Vulkan (lavapipe),
BSL 10.1.8 and Complementary Reimagined 5.9.3, in a scripted world. lavapipe has multi-draw, so the indirect path
was forced with a temporary dev switch (not in this jar). Same world, same spot, same pack:

* old code on the indirect path: shredded terrain, as in the bug report;
* fixed code on the indirect path: normal terrain, in daylight, at midnight, and in an underground X-ray test;
* fixed code on the default (multi-draw) path: still renders normally with both packs.

Not checked: a real AMD card (none available here). If something still looks wrong, send `latest.log`.
