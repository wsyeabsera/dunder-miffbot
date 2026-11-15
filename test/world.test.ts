import { test } from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../src/world/grid.ts";
import { buildLevel, roomAt } from "../src/world/level.ts";

test("A* goes around a wall and smooths the route", () => {
  const g = new Grid(0, 0, 20, 20);
  g.setRect(10, 0, 10.5, 15, 1); // a wall with a gap at the bottom
  const route = g.path({ x: 2, z: 2 }, { x: 18, z: 2 });
  assert.ok(route, "a route exists");
  assert.ok(route.length <= 5, `smoothed to few corners, got ${route.length}`);
  for (const p of route) assert.ok(g.free(p.x, p.z), "route stays clear of the wall");
});

test("A* finds nothing when the goal is walled off", () => {
  const g = new Grid(0, 0, 20, 20);
  g.setRect(8, 0, 8.5, 20, 1);
  assert.equal(g.path({ x: 2, z: 2 }, { x: 18, z: 2 }), null);
});

const level = buildLevel();
const HUB = { x: 8, z: -5 }; // the town square

test("the level has what the activity system needs", () => {
  assert.ok(level.seats.length >= 30, `desks for 30 employees, got ${level.seats.length}`);
  assert.equal(level.seats.filter((s) => s.reception).length, 1);
  for (const a of ["coffee", "lunch", "print", "restroom", "couch", "terrace", "library", "wander", "chat"] as const) {
    assert.ok(level.spots.some((s) => s.activity === a), `has ${a} spots`);
  }
});

test("every approach point is free and reachable from the town square", () => {
  const bad: string[] = [];
  for (const s of [...level.seats, ...level.spots]) {
    if (!level.grid.free(s.approach.x, s.approach.z)) bad.push(`${s.id} approach not free (${s.approach.x}, ${s.approach.z})`);
    else if (!level.grid.path(HUB, s.approach)) bad.push(`${s.id} unreachable`);
  }
  assert.deepEqual(bad, []);
});

test("every chat spot has a partner that faces it", () => {
  for (const s of level.spots.filter((x) => x.activity === "chat")) {
    const other = level.spots.find((x) => x.id === s.partner);
    assert.ok(other, `${s.id} has a partner`);
    assert.equal(other.partner, s.id);
    assert.ok(Math.abs(Math.sin(s.face) + Math.sin(other.face)) < 1e-9, "they face opposite ways");
    assert.ok(Math.hypot(s.x - other.x, s.z - other.z) < 2.2, "close enough to talk");
  }
});

test("seats and spots are inside their rooms and the building", () => {
  for (const s of [...level.seats, ...level.spots]) {
    assert.ok(s.x > -30 && s.x < 30 && s.z > -20 && s.z < 20, `${s.id} inside the building`);
    if (s.room !== "hall") assert.equal(roomAt(level, s.x, s.z), s.room, `${s.id} in room ${s.room}`);
  }
});

test("doors really open the walls", () => {
  for (const r of level.rooms) {
    for (const d of r.doors) {
      const z = d.side === "N" ? r.rect.z0 + 0.25 : d.side === "S" ? r.rect.z1 + 0.25 : d.at;
      const x = d.side === "W" ? r.rect.x0 + 0.25 : d.side === "E" ? r.rect.x1 + 0.25 : d.at;
      assert.equal(level.walls.solidAt(x, z), false, `${r.id} ${d.side} door is open`);
    }
  }
});
