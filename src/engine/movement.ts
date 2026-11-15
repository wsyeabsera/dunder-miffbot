// Walking along a planned path while keeping a little distance from others. Pure: positions in, positions out.
import { isSeated, type Entity, type World } from "./world.ts";

/** How far ahead (metres) a walker looks for people to go round. */
const AHEAD = 1.5;

export function move(world: World, a: Entity, dt: number) {
  if (!a.walking) return;
  const next = a.path[0];
  const dx = next.x - a.x;
  const dz = next.z - a.z;
  const dist = Math.hypot(dx, dz);
  const step = a.speed * dt;
  if (dist <= step) {
    a.x = next.x;
    a.z = next.z;
    a.path.shift();
    a.best = Infinity;
    a.stuck = 0;
    if (!a.path.length) {
      a.walking = false;
      a.heading = a.spot.face;
    }
    return;
  }
  let mx = (dx / dist) * step;
  let mz = (dz / dist) * step;
  // Pass people the way people do: when someone is ahead, step to your right (so two people walking at each other each
  // go round on their own right), and push apart if still too close.
  const fx = dx / dist;
  const fz = dz / dist;
  for (const o of world.entities) {
    if (o === a || isSeated(o)) continue;
    const rx = o.x - a.x;
    const rz = o.z - a.z;
    const d = Math.hypot(rx, rz);
    if (d < 0.001 || d > AHEAD) continue;
    const ahead = (rx * fx + rz * fz) / d; // 1 straight ahead, 0 beside, -1 behind
    if (ahead > 0.25) {
      const w = ((AHEAD - d) / AHEAD) * ahead;
      mx += fz * w * step * 1.8;
      mz -= fx * w * step * 1.8;
    }
    if (d < 0.7) {
      mx -= (rx / d) * (0.7 - d) * dt * 3;
      mz -= (rz / d) * (0.7 - d) * dt * 3;
    }
  }
  // Never step into a wall: try the full move, then sliding along either axis, then the plain step along the path; otherwise wait a moment.
  const { walls } = world.level;
  const tryMove = (x: number, z: number) => {
    if (walls.solidAt(a.x + x, a.z + z)) return false;
    a.x += x;
    a.z += z;
    return true;
  };
  if (!tryMove(mx, mz) && !tryMove(mx, 0) && !tryMove(0, mz)) tryMove(fx * step, fz * step);

  // Making progress? If not for three seconds (boxed in at a door, or nudged back and forth), skip to the waypoint, which is always clear.
  if (dist < a.best - 0.05) {
    a.best = dist;
    a.stuck = 0;
  } else if ((a.stuck += dt) > 3) {
    a.x = next.x;
    a.z = next.z;
    a.stuck = 0;
    a.best = Infinity;
  }
  a.heading = Math.atan2(dx, dz);
  a.phase += dt * a.speed * 5.5;
}
