// What people decide to do: go to the desk when there is work, otherwise take a break somewhere (coffee, lunch, a chat...).
// Pure: no three.js, no clock, a random number function in the world, so it is tested in Node.
import type { Activity, Spot } from "../world/level.ts";
import type { Pt } from "../world/grid.ts";
import type { Entity, World } from "./world.ts";

/** Chance weights and how long (seconds) someone stays, per break activity. */
export const BREAKS: { activity: Activity; weight: number; stay: [number, number] }[] = [
  { activity: "coffee", weight: 3, stay: [6, 10] },
  { activity: "lunch", weight: 2, stay: [12, 20] },
  { activity: "print", weight: 2, stay: [5, 8] },
  { activity: "restroom", weight: 1.5, stay: [5, 8] },
  { activity: "couch", weight: 2, stay: [12, 24] },
  { activity: "terrace", weight: 1.5, stay: [10, 20] },
  { activity: "library", weight: 1, stay: [6, 12] },
  { activity: "wander", weight: 1, stay: [4, 8] },
  { activity: "chat", weight: 2.5, stay: [9, 15] },
];

/** The walk from where someone is to a spot: out of their chair first if seated, then the route, then the last step onto the spot. */
export function route(world: World, a: Entity, to: Spot): Pt[] {
  const pts: Pt[] = [];
  let start: Pt = { x: a.x, z: a.z };
  if (!a.walking && Math.hypot(a.x - a.spot.x, a.z - a.spot.z) < 0.3) {
    pts.push(a.spot.approach); // step out of the chair first
    start = a.spot.approach;
  }
  const mid = world.level.grid.path(start, to.approach);
  if (mid) pts.push(...mid);
  else pts.push(to.approach);
  if (to.approach.x !== to.x || to.approach.z !== to.z) pts.push({ x: to.x, z: to.z });
  return pts;
}

export function goTo(world: World, a: Entity, to: Spot) {
  if (world.holder.get(a.spot.id) === a && a.spot !== a.seat) world.holder.delete(a.spot.id);
  world.holder.set(to.id, a);
  a.path = route(world, a, to);
  a.spot = to;
  a.walking = a.path.length > 0;
}

export function pickBreak(world: World, a: Entity) {
  const { level, holder, rng } = world;
  const options = BREAKS.map((b) => ({ ...b, free: level.spots.filter((s) => s.activity === b.activity && !holder.has(s.id)) })).filter((b) => b.free.length);
  const total = options.reduce((t, o) => t + o.weight, 0);
  let r = rng() * total;
  for (const o of options) {
    if ((r -= o.weight) <= 0) {
      const spot = o.free[Math.floor(rng() * o.free.length)];
      goTo(world, a, spot);
      a.stay = o.stay[0] + rng() * (o.stay[1] - o.stay[0]);
      // A chat needs two: call over someone on a break to stand opposite
      const partner = spot.partner ? level.spots.find((s) => s.id === spot.partner) : undefined;
      if (partner && !holder.has(partner.id)) {
        const mate = world.entities.find((b) => b !== a && b.e.status === "idle" && !b.walking && b.stay > 0 && !b.spot.partner);
        if (mate) {
          goTo(world, mate, partner);
          mate.stay = a.stay;
        }
      }
      return;
    }
  }
}

/** One step of thinking for one person. */
export function decide(world: World, a: Entity, dt: number) {
  if (a.walking) return;
  if (a.e.status !== "idle") {
    if (a.spot !== a.seat) goTo(world, a, a.seat);
    return;
  }
  a.stay -= dt;
  if (a.stay > 0) return;
  // Back to the desk now and then, otherwise somewhere else
  if (a.spot !== a.seat && world.rng() < 0.3) {
    goTo(world, a, a.seat);
    a.stay = 6 + world.rng() * 8;
  } else {
    pickBreak(world, a);
    if (!a.walking) a.stay = 3 + world.rng() * 3;
  }
}
