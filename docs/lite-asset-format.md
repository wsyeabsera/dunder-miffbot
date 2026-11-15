# Designing characters and props in Lite for Dunder Miffbot

Goal: design people and office furniture in `lite` (where Claude can see and review them), export the scene JSON, and load it in the app with `src/lite-model.ts`. This replaces hand-written primitives in `src/models.ts` piece by piece, so the 3D upgrade is designed visually and reviewed, not guessed in code.

Lite scenes are data only: boxes, spheres, cylinders, cones, capsules, tori, planes and groups, with colour, roughness, metalness, emissive and opacity. The app's current models use exactly these shapes, so a Lite design maps one to one.

## Conventions

- **Units and orientation:** metres. The origin is on the floor at the model's centre (a character: between the feet). The model faces **+z**. `rot` is in degrees (XYZ), as in Lite.
- **Joints:** a group whose `name` is `joint:<name>` becomes a pivot the app can rotate. Put the group's `pos` at the joint, and the shape inside it hanging from that point (an arm hangs down the group's local -y).
- **Recolour roles:** an object whose `name` contains `@shirt`, `@pants`, `@shoes`, `@hair` or `@skin` is retinted per employee. Its own colour is the default look.
- **Capsules:** Lite's capsule `size[1]` is the whole length (the app converts).
- **Not used for models:** text, terrain and repeaters are ignored by the loader. Use plain objects.
- **Limits:** a Lite scene allows 2000 objects and 200 KB. A character is about 60 objects.

## Character rig (joint names the app animates)

`joint:body` (root, bobbing), `joint:head`, `joint:armL`, `joint:armR` (shoulder), `joint:forearmL`, `joint:forearmR` (elbow, nested inside the arm), `joint:legL`, `joint:legR` (hip). Pivot heights to match the current character (about 1.9 tall at height 1.0): hips 0.86, shoulders 1.52, neck/head 1.66, elbow 0.44 below the shoulder. Eyes are separate small spheres named `eyeL` and `eyeR` (the app blinks them by scaling).

Reference for proportions and the current look: `src/models.ts` `makeCharacter`, and the dev character sheet at `/people.html` in `npm run dev`.

## Props

One scene per prop (or per kit, with each prop a top-level group named for what it is). Wall items face +z and sit against the wall plane at z = 0. Animated parts keep a name the app can find: `screen` (glows with status), `led*` (blinking).

## Getting a design from Lite to the app

1. Design the model in a Lite scene (Claude uses the Lite scene tools; review with `validate_scene` and `review_scene`).
2. Read the scene back (`get_scene`) and save its `objects` array as `src/assets/<name>.lite.json` in this repo.
3. Load it: `buildLiteModel(json.objects, { shirt, pants, shoes, hair, skin })` returns `{ group, joints }`.
4. Compare it next to the old version in `/people.html` before switching the app over.

## Known gaps in Lite (tasks filed)

- No partial sphere (a dome), so hair caps are approximated with squashed spheres until Lite gets one.
- No export command: the JSON has to be read back through the scene tools.
- Whether Lite's camera can show an isometric (orthographic) preview is unchecked.
