# The Dunder Miffbot engine (on top of three.js)

Decision (2026-11-15): build our own thin game-engine layer on three.js, grown out of what already exists. Not a rewrite and not a new renderer: three.js draws; the engine decides what exists, what it does and what is loaded. Libraries are used for hard, solved problems (physics, later WebGPU), not for the engine's shape.

## Why

The app already has the seeds: the building as data (`src/world/level.ts`), navigation (`grid.ts`), a camera rig (`camera-rig.ts`), skinned characters (`actors.ts`). But `src/office.ts` mixes behaviour, animation, input and drawing, so each new feature (floors, chunks, a second building, an editor) means touching everything. An engine gives each concern one home so we can grow **vertically** (more floors, more systems, deeper behaviour) and **horizontally** (more buildings, a street, many more people).

## Shape

```
src/engine/
  world.ts       entities and components (position, heading, activity, status, appearance), one source of truth
  loop.ts        fixed-step update plus variable-step render, pause, time scale
  events.ts      a tiny typed event bus (selected, mode changed, task given)
  assets.ts      asset registry and loader: models, clips, textures, by name, shared and cached
  physics.ts     Rapier (WebAssembly): walls and furniture as static colliders, a character controller (built, tested)
  chunks.ts      the world split into chunks that load and unload (later: floors)
  systems/       behaviour (activities), movement (navigation), animation, camera, picking, ui-sync
  render/        the only code that touches three.js: scene sync, characters, props, lighting, culling
```

Rules: systems read and write the world state; **only `render/` creates or moves three.js objects**; the world state is plain data (serialisable, testable in Node, later synced with the backend).

## Growing

- **Floors:** the level format gets floors; each has its own nav grid; stairs and lifts are graph links; the renderer hides floors above the viewed one.
- **Chunks:** the world is chunked; chunks stream by distance with their props, nav and people; far people stop animating.
- **Editor:** Lite authors levels as data; the engine loads them.
- **Physics:** Rapier is the engine's physics (decided 2026-11-15). `src/engine/physics.ts` already turns the level into static colliders and moves a capsule through it, sliding along walls, stopping at furniture and passing through doors (4 tests). Next: wire it into walk mode (#2478), then doors, pushable objects, and people-to-people collisions to replace the hand-made separation.
- **Renderer:** WebGPU (three's renderer or another) is swapped in behind `render/` without touching systems.

## Built so far

- `src/engine/world.ts`: entity and world state (plain data), seat assignment, spawning.
- `src/engine/behavior.ts`: what people decide (desk, break spots, chats), pure.
- `src/engine/movement.ts`: walking along paths with separation, pure.
- `src/engine/physics.ts`: Rapier, used by walk mode.
- All four are tested in Node with no three.js (`test/engine.test.ts`: five simulated minutes with 30 people, nobody enters a wall, spots are never double booked, chats happen).
- Still in `src/office.ts`: animation choice, picking, camera glue, the scene and its drawing. Next to extract: the animation system, picking, then the render module.

## First milestone

Split `office.ts` into systems over a world state (task #2535), with behaviour unchanged, plus tests for the pure parts. Everything else is built on that.
