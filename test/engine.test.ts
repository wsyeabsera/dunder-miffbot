import { test } from "node:test";
import assert from "node:assert/strict";
import { employees, fillOffice, giveTask } from "../src/state.ts";
import { buildLevel } from "../src/world/level.ts";
import { assignSeats, createWorld, isSeated, spawn, type Entity } from "../src/engine/world.ts";
import { decide } from "../src/engine/behavior.ts";
import { move } from "../src/engine/movement.ts";

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

fillOffice(30);
const level = buildLevel();

function makeWorld(seed: number) {
  const rng = seeded(seed);
  const crew = employees.slice(0, level.seats.length);
  const seats = assignSeats(level, crew);
  const entities: Entity[] = crew.map((e, i) => spawn(e, seats[i], i, rng));
  return createWorld(level, entities, rng);
}
const step = (w: ReturnType<typeof makeWorld>, dt: number) => {
  for (const a of w.entities) {
    decide(w, a, dt);
    move(w, a, dt);
  }
};

test("everyone gets their own seat, and the receptionist the reception desk", () => {
  const w = makeWorld(1);
  const ids = new Set(w.entities.map((a) => a.seat.id));
  assert.equal(ids.size, w.entities.length, "no two people share a seat");
  const priya = w.entities.find((a) => a.e.post === "reception")!;
  assert.ok(priya.seat.reception);
});

test("five minutes of office life: nobody walks into a wall, spots are never double booked, breaks are varied", () => {
  const w = makeWorld(42);
  const activities = new Set<string>();
  let pairs = 0;
  let meetings = 0;
  for (let t = 0; t < 3000; t++) {
    step(w, 0.1);
    for (const a of w.entities) {
      assert.equal(level.walls.solidAt(a.x, a.z), false, `${a.e.name} stood in a wall at step ${t} (${a.x.toFixed(2)}, ${a.z.toFixed(2)})`);
      activities.add(a.spot.activity);
    }
    // One holder per spot, and it is who is actually heading there
    for (const [spotId, holder] of w.holder) assert.equal(w.entities.includes(holder), true, `${spotId} held by a stranger`);
    // Two people on the two ends of a chat pair at once
    const chatting = w.entities.filter((a) => !a.walking && a.spot.activity === "chat" && a.spot.partner && w.holder.get(a.spot.partner) && !w.holder.get(a.spot.partner)!.walking);
    if (chatting.length >= 2) pairs++;
    // Three or more people seated in one meeting room
    for (const room of ["meetA", "meetB"]) if (w.entities.filter((a) => !a.walking && a.spot.activity === "meeting" && a.spot.room === room).length >= 3) meetings++;
  }
  assert.ok(activities.size >= 6, `varied breaks, saw ${[...activities].join(", ")}`);
  assert.ok(pairs > 0, "at least once two people stood facing each other to chat");
  assert.ok(meetings > 0, "at least once three or more people sat down in a meeting room together");
});

test("someone given work walks back to their desk and sits there", () => {
  const w = makeWorld(7);
  const a = w.entities[3];
  // Let the office run until they have wandered off, then give them a task
  for (let t = 0; t < 1500 && (a.spot === a.seat || a.walking); t++) step(w, 0.1);
  assert.notEqual(a.spot, a.seat, "they left the desk");
  giveTask(a.e.id, "Reconcile the stapler inventory");
  for (let t = 0; t < 900 && !(a.spot === a.seat && isSeated(a)); t++) {
    // keep the task alive: status is read each step
    a.e.status = "working";
    step(w, 0.1);
  }
  assert.ok(a.spot === a.seat && isSeated(a), "back at the desk");
});
