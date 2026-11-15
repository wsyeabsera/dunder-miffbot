# Spike: WebGPU renderer versus Babylon.js (task #2540)

Date: 2026-11-15. Question: do we need a different renderer or engine for the next visual jump?

## What I tried

three.js's own `WebGPURenderer` on the real office (30 skinned people, the full building, shadows, mood lights), behind a flag: add `?webgpu` to the address. `src/office.ts` picks the renderer; nothing else changed.

## Result (same laptop, same window, 6-second runs, 120 Hz display)

| Renderer | Frame rate | Worst frame |
|---|---|---|
| WebGL (current) | 117 fps | 18 ms |
| WebGPU (`?webgpu`) | 120 fps | 9 ms |

- The scene rendered correctly the first time with the existing materials, skinned characters, shadows and lights. No code changes besides creating the renderer.
- Smoother, not just faster: half the worst-frame time.
- Differences to fix before making it the default: the background looks darker (clear colour and colour space handling differ), and `PCFSoftShadowMap` is not supported (three falls back to `PCFShadowMap` and warns).
- Not tested: Safari and Firefox (WebGPU support there is more limited; three's `WebGPURenderer` falls back to WebGL 2 by itself when WebGPU is missing, which still needs a check).

## Babylon.js, from what it offers (not tested)

Babylon includes physics (Havok), an inspector, GUI, a navmesh plugin and a WebGPU engine out of the box. But everything we have is three.js: the building builder, characters and clothing, camera rig, physics glue. Moving means rewriting all of it to gain things we already got elsewhere (Rapier for physics, our own navigation and level data, Lite for design). Not worth it now.

## Decision

Stay on three.js. Make `WebGPURenderer` the default once the background, tone mapping and shadow look match, with the WebGL fallback kept and checked in Safari and Firefox. That unlocks node materials (TSL) for better water, glass and screen effects later, and compute for crowds if we ever need hundreds of people.

## Next steps

1. Match the clear colour and compare screenshots between the two renderers.
2. Test the fallback path in Safari and Firefox.
3. Flip the default; keep `?webgl` as an escape hatch.
