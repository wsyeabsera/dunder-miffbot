# Dunder Miffbot: the big office and the POV camera (design and research)

Status: draft, 2026-11-15. Follows `2026-11-15-office-ui-design.md` (the first office). Nothing here is built yet; the task group `office-world` carries the work.

## Why

The first office is one 16 x 14 room. Walking from the couch to the coffee machine takes a few steps, so it reads as a small box, not a place. Yab wants a much bigger office, with real rooms and people walking between them, and a point-of-view (POV) camera so the office can be seen from inside, like a game.

## Goals

- A building roughly 60 x 40 units (about 10 times today's floor area): lobby, open-plan floor, manager's office, meeting rooms, kitchen, lounge, print room, server room, restrooms, a terrace. Hallways and doors between them, so a trip across takes real time.
- 30 or so employees at once, each with a reason to be where they are (desk, meeting, kitchen, print, chat).
- Camera modes: the existing isometric view (now with pan, zoom and rotate, since the map no longer fits), a follow camera, an employee POV, and a boss walk-around mode.
- Still smooth (about 60 fps) on a normal laptop.

## Non-goals

- Several floors, multiplayer, physics, sound, VR. A real backend is slice 1 of `docs/ideas.md`, not this work.
- Mobile layouts (desktop only, as before).

## Research findings

- **First person:** three.js ships `PointerLockControls` (mouse-look through the browser Pointer Lock API). Movement and collision are left to us. The usual pattern is a capsule (here a circle on the floor is enough) pushed out of obstacles each frame, with the camera at eye height above it, pitch clamped. [PointerLockControls docs](https://threejs.org/docs/pages/PointerLockControls.html), [a first-person guide](https://abratabia.com/threejs/first-person-controls.php). three's own `Octree` and `Capsule` helpers do the same for arbitrary meshes, but our rooms are boxes, so plain circle-versus-box checks are simpler.
- **Navigation:** `recast-navigation` (WebAssembly port of Recast and Detour, with a three.js package) gives navmeshes and a crowd that avoids itself. `three-pathfinding` gives paths but no agent avoidance, and a forum report says it becomes a CPU bottleneck with many agents. [recast-navigation](https://www.npmjs.com/package/recast-navigation), [forum thread](https://discourse.threejs.org/t/r3f-three-pathfinding-cpu-bottleneck-how-to-truly-optimize-navmesh-pathfinding-for-many-enemies/87162). Our building is axis-aligned boxes, so a grid A* with door waypoints is enough to start. Recast stays an upgrade if crowds jam.
- **Big-scene performance:** merging static meshes cuts draw calls but loses culling (one bounding sphere), so merge per spatial chunk, not per level. `InstancedMesh` suits repeated props but three.js does not cull instances individually. Shadow-casting lights re-draw their casters, so keep one shadow light and make its box follow the camera or bake static shadows. [Codrops write-up](https://tympanus.net/codrops/2026/08/22/sixty-frames-for-the-record-a-three-js-game-seven-fly-throughs-and-a-wall-of-crts/), [forum thread on culling and instancing](https://discourse.threejs.org/t/how-to-do-frustum-culling-with-instancedmesh/22633).
- **Switching camera types:** a camera's projection is fixed, so isometric (orthographic) and POV (perspective) are two cameras. Match the visible height when swapping, and animate the perspective camera into the isometric pose before swapping. [forum thread](https://discourse.threejs.org/t/how-to-switch-camera-between-perspective-and-orthographic-with-similar-zoom/10444).
- **Not verified:** these are mostly forum posts and tutorials, not official docs. Check the current three.js API for anything we rely on.

## Decisions (my calls, for Yab to check)

1. **The building is data.** One level description (rooms, walls, doors, props) feeds the 3D builder, the collision for walk mode, and the navigation grid, so they can never disagree.
2. **Grid A* with doors, not Recast**, to start. Employees reserve spots (as they already do at the coffee machine) to avoid each other. Move to Recast only if crowds jam.
3. **Circle-versus-box collision** for walk mode, using the same wall data.
4. **Two cameras behind one rig.** Isometric (orthographic, with pan, zoom and 90-degree rotation) and a perspective camera for follow, employee POV and boss walk. Transitions tween between them.
5. **POV means both**: spectate any employee's eyes first (cheap, the camera rides on their head), then free walking as the boss with pointer lock. Yab can reorder these.
6. **Performance rules:** instancing for repeated props, static meshes merged per chunk (about 8 units), one shadow light whose box follows the camera, name labels only when hovered or selected, a frame budget measured with 30 employees.
7. **More employees are fake placeholders** (generated looks and names) until slice 1 supplies real ones.
8. **img2threejs and the Mailroom** are a later stream: a pipeline for better props from reference images, and an "art department" employee that asks the laptop's Claude for them. The Mailroom is built but not deployed.

## Open questions (Yab)

- Which POV first: employee eyes or walking as the boss?
- Rough preference for the building style: modern open office, or the cosy cluttered paper-company look?
- Should visitors (customers) appear in the lobby, or employees only?
