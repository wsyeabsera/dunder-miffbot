// Walking along a planned path while keeping a little distance from others. Pure: positions in, positions out.
import { isSeated, type Entity, type World } from "./world.ts";

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
    if (!a.path.length) {
      a.walking = false;
      a.heading = a.spot.face;
    }
    return;
  }
  let mx = (dx / dist) * step;
  let mz = (dz / dist) * step;
  // Keep a little distance from people who are standing or walking nearby
  for (const o of world.entities) {
    if (o === a || isSeated(o)) continue;
    const ox = a.x - o.x;
    const oz = a.z - o.z;
    const d = Math.hypot(ox, oz);
    if (d < 0.7 && d > 0.001) {
      mx += (ox / d) * (0.7 - d) * dt * 2;
      mz += (oz / d) * (0.7 - d) * dt * 2;
    }
  }
  if (!world.level.walls.solidAt(a.x + mx, a.z + mz)) {
    a.x += mx;
    a.z += mz;
  } else {
    a.x += (dx / dist) * step;
    a.z += (dz / dist) * step;
  }
  a.heading = Math.atan2(dx, dz);
  a.phase += dt * a.speed * 5.5;
}
