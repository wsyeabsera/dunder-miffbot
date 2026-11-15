# Dunder Miffbot: the office UI (design)

Status: draft for approval, 2026-11-15. Supersedes the "UI" parts of `docs/ideas.md`; the rest of that file (employees, brains, slices) still stands.

## Intent

The app is an office of AI employees. The UI is that office as a video game: a 3D room you look at from a corner, with employees at desks doing their jobs. Yab wants it to feel alive and fun, not like an admin table. It is also how Yab manages the employees: click one, see them, give them work.

## Goals

- A single 3D office room, fixed isometric view (Sims / Game Dev Tycoon feel). Everyone is visible at once.
- Each employee has a desk and a visible state, taken from backend state: working (typing at the desk), idle (wandering to coffee machine / lounge), resting (out of daily allowance, asleep or away).
- Click an employee (or their desk) to open a side panel: personality, current task, work log, memory, allowance. Tasks are handed out from here.
- Looks good with 2 employees (the starting pair) and still reads with ~10.
- Designed and reviewed first in `lite` (layout, colours, camera, side panel), then built for real in this repo.

## Non-goals

- Walking around as the boss (camera style C), free-orbit navigation (B). The camera is fixed in v1; the 3D engine leaves orbit and zoom possible later.
- Phones and tablets. Desktop browsers only (same rule as `lite`).
- Multiplayer, physics, sound, day/night cycle, decorating the office.
- Backend work (employees, memory, cron). That is slice 1 of `ideas.md`; the UI must not wait for it.
- Photoreal assets, AI mesh generation services, or any paid asset API.

## Anti-goals (a failure even if it technically works)

- A good-looking office whose characters do nothing meaningful: animation must reflect real employee state, not a random loop.
- A heavy 3D scene that needs a gaming PC or loads slowly. It must run smoothly on a normal laptop.
- Look-and-feel drifting between the `lite` mockup and the real build.

## Constraints

- Hosted on Cloudflare (static assets plus Worker), per `ideas.md`; login copied from `lite`.
- Three.js with an orthographic camera. Models are plain code (Three.js primitives and generated geometry), no external model files and no texture downloads.
- `lite` scenes are **data only**: JSON of boxes, spheres, cylinders, capsules, groups and repeaters, plus lights, sky and camera. No code runs there and no `.glb` loads (`lite/docs/scenes.md`). So `lite` can mock the office but cannot hold the real assets.
- img2threejs outputs TypeScript model factories, not meshes. Its models have no skeleton, so characters are posed or moved as whole objects, or animated with simple transforms (bobbing, arm swing built from separate parts). A rigged animation plugin is out of scope for v1.
- **Gap in `lite`:** its 3D support is too thin for real 3D design (primitives only, no models, no textures, no code; orthographic camera support unverified). Yab wants this fixed. It is a separate project, brainstormed after this one, and this build must not depend on it.
- Repo state: `dunder-miffbot` is empty apart from docs (no code, no stack, no Cloudflare config). `lite` is at `~/Hobby/lite`; its login is documented in `lite/docs/auth.md` and its Worker setup is in `wrangler.jsonc`.
- img2threejs is a community skill, not installed, not security-reviewed. Review it before running it. It runs Python scripts and writes into the project.

## Approaches considered

**Camera:** isometric cutaway (chosen by Yab), free-orbit 3D, walkable boss. Orbit and walking cost more and are worse for glancing at many employees.

**How to use the image-to-3D skill with `lite`:**
1. **Split (chosen by Yab: "your pick").** Design the office in `lite` using primitives for desks, chairs and figures. Build the real models in this repo with img2threejs. `lite` decides the look; the skill makes the assets. Cost: the `lite` mockup is blockier than the final.
2. img2threejs only, `lite` for 2D screens. Best visuals soonest, but loses `lite`'s review loop for the 3D part.
3. Teach `lite` to load external models or run code. Rejected: it breaks a deliberate rule in `lite`.

## Decisions

Decided by Yab:
- Video-game look, isometric corner cutaway.
- Use img2threejs for the assets, and `lite` for design and prototypes.
- Option 1 (the split).

My calls, for Yab to check:
- Three.js with an orthographic camera. Reason: matches Yab's existing Three.js setup (`scene-builder`) and keeps real 3D open for later.
- Side panel on click, not a modal. Reason: the office stays visible while Yab reads.
- Employee visual state comes from one small state shape (id, name, status, current task, allowance) that the UI reads. Until slice 1 exists it comes from fake data in the repo. Reason: UI first, backend later, without rewriting the UI.
- Employees look different from each other (colour, hair or accessory) so personalities read at a glance.
- **Phases, with a gate between:** (1) the `lite` mockup: office scene from primitives plus the side-panel screen. Yab approves it. (2) The real build in this repo, using the approved mockup's layout and palette. The real build does not start before sign-off.
- **img2threejs is not a hard requirement.** Review it for safety before running it. If it fails review or its models are unusable, the baseline is hand-built primitive models in code, and the skill is an upgrade for props and characters.
- **State shape the UI reads:** `{ id, name, look, status: "working" | "idle" | "resting", task?: string, allowance: { used, total }, personality, log: [{ at, text }], memory: [string] }`. Until slice 1, a fake-data module in the repo provides it, with a dev control to switch an employee's status so the animations can be tested against state changes.
- **"Hand out a task" in v1:** a text box in the side panel that adds a task to the fake local state and sets the employee to working. It is a stub for the backend, not a real queue.
- **Room size:** one fixed room with 10 desk slots. Empty slots show empty desks, so 2 employees leave 8 empty desks. Employees take the first free slot.
- **Performance target:** smooth (about 60 fps) on a normal recent laptop in Chrome, desktop only. No post-processing; shadows only if the target holds.

## Left to the builder

- Room layout and number of desks, props (coffee machine, plant, whiteboard, lounge corner) and colour palette, within the `lite` design.
- Animation details and pathfinding for wandering (simple waypoints are fine).
- How `lite` scene JSON maps to the real Three.js scene, if at all. A hand-copy of positions and colours is fine.
- Build setup (bundler, framework for the side panel), matching the `lite` repo where sensible.
- Whether the side panel is React or plain TypeScript.

## Open questions

- Personalities of the two starting employees are not described yet (`ideas.md`). The UI can ship with placeholder names and looks; the real pair should be described before slice 1.
