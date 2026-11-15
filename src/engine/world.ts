// The simulation's state: plain data, no three.js. Systems (behaviour.ts, movement.ts) read and write it; the renderer only looks at it.
import type { Employee } from "../state.ts";
import type { Pt } from "../world/grid.ts";
import type { Level, Spot } from "../world/level.ts";

/** Everything the behaviour and movement systems know about one person. */
export type Entity = {
  e: Employee;
  seat: Spot;
  /** Where they are, or are heading. */
  spot: Spot;
  path: Pt[];
  walking: boolean;
  /** Seconds left at the current spot before choosing the next. */
  stay: number;
  x: number;
  z: number;
  /** The direction they want to face, radians (0 faces +z). */
  heading: number;
  speed: number;
  /** Walk-cycle phase, also used to desynchronise neighbours. */
  phase: number;
  /** Picks between similar animation clips so neighbours do not move in sync. */
  variant: number;
  /** Seconds without getting closer to the next waypoint (boxed in or nudged back and forth); past a point they skip to it. */
  stuck: number;
  /** Closest they have been to the next waypoint so far. */
  best: number;
};

export type World = {
  level: Level;
  entities: Entity[];
  /** Who holds each spot: one person per spot, and desks belong to their owner. */
  holder: Map<string, Entity>;
  rng: () => number;
};

export const isSeated = (e: Entity) => !e.walking && (e.spot.pose === "desk" || e.spot.pose === "sit" || e.spot.pose === "sitSoft");

/** Give each employee a seat: the receptionist the reception desk, everyone else a desk spread across the floor. */
export function assignSeats(level: Level, people: { post?: string }[]): Spot[] {
  const reception = level.seats.find((s) => s.reception)!;
  const desks = level.seats.filter((s) => !s.reception);
  let next = 0;
  return people.map((p) => (p.post === "reception" ? reception : desks[(next++ * 11) % desks.length]));
}

/** A person sitting at their seat, with the staggered timers that keep a whole office from standing up at once. */
export function spawn(e: Employee, seat: Spot, index: number, rng: () => number): Entity {
  const between = (a: number, b: number) => a + rng() * (b - a);
  return { e, seat, spot: seat, path: [], walking: false, stay: between(1, 14), x: seat.x, z: seat.z, heading: seat.face, speed: between(1.25, 1.75), phase: index * 1.7, variant: index, stuck: 0, best: Infinity };
}

/** The world around some entities (which may carry extra fields, such as their 3D body). */
export function createWorld(level: Level, entities: Entity[], rng: () => number = Math.random): World {
  const holder = new Map<string, Entity>();
  for (const a of entities) holder.set(a.seat.id, a);
  return { level, entities, holder, rng };
}
