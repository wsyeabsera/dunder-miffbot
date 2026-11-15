# Performance (task #2486)

Measured 2026-11-15 on one laptop (Apple Silicon, Chrome, 120 Hz display), dev server, 30 skinned people animating, the full 60 x 40 building, shadows and six mood lights. Each figure is a 4-second `requestAnimationFrame` count.

| View | Frame rate | Worst frame |
|---|---|---|
| Overhead | 120 fps | 9 ms |
| Follow | 104 fps | 18 ms |
| Through their eyes | 113 fps | 18 ms |
| Walk | 120 fps | 10 ms |

`?webgpu` (three.js WebGPU renderer): 120 fps, worst 9 ms (see `docs/webgpu-spike.md`).

## What keeps it fast

- Static props merged per 24-unit chunk and material; characters' rigid parts merged per bone (about 20 draw calls each instead of 45).
- Click tests use one invisible box per person, never the skinned meshes.
- Pathfinding is cheap: 0.8 ms per path (4 far-apart routes, 40 runs), so it is not the source of spikes.
- Rapier (4 MB of WebAssembly) loads only the first time someone walks. three.js is its own cached chunk; our own code is about 52 KB.
- Animation files trimmed to the 11 clips in use (15 MB to 2 MB); assets are 20 MB.

## Not measured

- Slower machines, integrated GPUs, 60 Hz displays: frame rate there may be lower; the mood lights (about 8 fps on an earlier run) and the 4096 shadow map are the first things to reduce.
- First-load time on a normal connection: 20 MB of assets plus about 0.9 MB of code.
- Earlier runs (before the animation trim and chunking) showed 56 to 64 fps and 50 ms spikes; the spikes were not reproduced in these runs, so they were probably other work on the machine.

## If it ever drops

Throttle skeleton updates for far people, drop the shadow map to 2048 or make it follow the camera (#2455), turn off mood lights, and instance repeated props (#2454).
