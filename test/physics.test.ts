import { test } from "node:test";
import assert from "node:assert/strict";
import { createPhysics } from "../src/engine/physics.ts";
import { buildLevel } from "../src/world/level.ts";

const level = buildLevel();
const physics = await createPhysics(level);

/** Walk in small steps, as a game would, and report where the feet end up. */
function walk(w: ReturnType<typeof physics.walker>, dx: number, dz: number, steps: number) {
  for (let i = 0; i < steps; i++) w.move(dx / steps, dz / steps);
  return w.position();
}

test("a walker stops at a wall instead of passing through it", () => {
  // The wall between the hall and the meeting rooms is at z = -8 to -7.5; (5, -6) is in the hall, below a solid stretch.
  const w = physics.walker(6.5, -6);
  const end = walk(w, 0, -3, 30);
  assert.ok(end.z > -7.5, `stopped in front of the wall, ended at z = ${end.z.toFixed(2)}`);
  assert.ok(end.z < -6.5, `moved up to the wall, ended at z = ${end.z.toFixed(2)}`);
  w.remove();
});

test("a walker slides along a wall when walking into it at an angle", () => {
  // x from -8 to -5 along that wall has no door (the doors are at x = -11 and x = -1)
  const w = physics.walker(-8, -6);
  const end = walk(w, 3, -3, 40);
  assert.ok(end.x > -5.5, `kept moving along the wall, ended at x = ${end.x.toFixed(2)}`);
  assert.ok(end.z > -7.5, "never crossed the wall");
  w.remove();
});

test("a walker goes through a door", () => {
  // Meeting room B has its door at x = -1 in the wall at z = -8.
  const w = physics.walker(-1, -6);
  const end = walk(w, 0, -5, 50);
  assert.ok(end.z < -9, `walked into the meeting room, ended at z = ${end.z.toFixed(2)}`);
  w.remove();
});

test("furniture blocks a walker", () => {
  // A desk sits at (-26, -2.4): walking straight into it from the aisle must stop short.
  const w = physics.walker(-26, -5.5);
  const end = walk(w, 0, 4, 40);
  assert.ok(end.z < -2.4, `stopped at the desk, ended at z = ${end.z.toFixed(2)}`);
  w.remove();
});
