# Dunder Miffbot

A 3D office of AI employees, in the browser: a 60 x 40 building with rooms, about 30 animated people who walk to the coffee machine, the kitchen, the lounge and back to their desks, and four ways to look at it (overhead, follow, through their eyes, walk around as the boss). Built on three.js with a thin engine layer of our own (`docs/engine.md`), deployed as a password-protected Cloudflare Worker.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173 (or the port Vite prints): no login locally
npm test         # unit tests (node:test): world, navigation, physics, state, session, Lite loader
npm run build    # type check and production build
```

## Controls

| | |
|---|---|
| Click a person or desk | open their panel (personality, task box, log) |
| Drag, wheel, Q and E | pan, zoom, rotate the overhead view |
| 1, 2, 3, 4 | overhead, follow, through their eyes, walk (WASD, Shift runs, E talks to who you look at) |
| Esc | back to overhead (once to free the mouse in walk mode, again to leave) |

The list on the left finds people; the minimap jumps to a room or a person. The panel shows what the selected person is doing right now. Add `?webgpu` to the address to draw with three.js's WebGPU renderer (see `docs/webgpu-spike.md`).

## Deploy

```sh
npx wrangler secret put MIFF_PASSWORD    # once; nothing is served without it
npm run deploy
```

The Worker (`worker/`) serves the static site only to a signed-in visitor (signed cookie, five tries a minute per connection). Never remove `run_worker_first` from `wrangler.jsonc`.

## Layout

- `src/office.ts` the scene, people and behaviour (being split into `src/engine/`, see `docs/engine.md`)
- `src/world/` the building as data (`level.ts`), walkable grid and A* (`grid.ts`), 3D builder (`build.ts`)
- `src/actors.ts` skinned characters and clothing; `public/assets/characters/` the CC0 models and animations
- `src/camera-rig.ts` the four camera modes; `src/engine/physics.ts` Rapier physics for walk mode
- `src/lite-model.ts`, `scripts/lite/` designing models in Lite and loading them here (`docs/lite-asset-format.md`)
- `src/engine/` behaviour, movement and world state (pure, tested), physics
- `docs/` design notes: office UI, big office, engine, Lite assets, performance, WebGPU spike

## Credits

Characters and animations: Quaternius, Universal Base Characters and Universal Animation Library 1 and 2, CC0 (`public/assets/characters/LICENSE-Quaternius-CC0.txt`).
