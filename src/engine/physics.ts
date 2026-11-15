// The engine's physics: Rapier (WebAssembly). The building from the level data becomes static colliders, and a character
// controller moves a capsule through it, sliding along walls and furniture. Pure of three.js, so it is tested in Node.
import RAPIER from "@dimforge/rapier3d-compat";
import { CELL, type Pt } from "../world/grid.ts";
import { WALL_HEIGHT, footprint, type Level } from "../world/level.ts";

export type Walker = {
  /** Where the capsule's feet are. */
  position(): { x: number; y: number; z: number };
  /** Try to move by (dx, dz) this step; returns the movement that actually happened after sliding along obstacles. */
  move(dx: number, dz: number): Pt;
  /** Put it somewhere (spawning, teleporting). */
  place(x: number, z: number): void;
  remove(): void;
};

export type Physics = {
  world: RAPIER.World;
  /** Create a character: a capsule `height` tall and `radius` wide standing at the given spot. */
  walker(x: number, z: number, radius?: number, height?: number): Walker;
};

let ready: Promise<void> | null = null;

/** Static colliders for the walls (runs of wall cells merged into boxes), the furniture footprints and the floor. */
function addBuilding(world: RAPIER.World, level: Level) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const box = (x0: number, z0: number, x1: number, z1: number, height: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, height / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, height / 2, (z0 + z1) / 2), body);

  const { walls } = level;
  const seen = new Uint8Array(walls.solid.length);
  for (let r = 0; r < walls.rows; r++) {
    for (let c = 0; c < walls.cols; c++) {
      if (!walls.solid[walls.index(c, r)] || seen[walls.index(c, r)]) continue;
      let c1 = c;
      while (c1 + 1 < walls.cols && walls.solid[walls.index(c1 + 1, r)] && !seen[walls.index(c1 + 1, r)]) c1++;
      let r1 = r;
      if (c1 === c) while (r1 + 1 < walls.rows && walls.solid[walls.index(c, r1 + 1)] && !seen[walls.index(c, r1 + 1)]) r1++;
      for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) seen[walls.index(cc, rr)] = 1;
      box(walls.x0 + c * CELL, walls.z0 + r * CELL, walls.x0 + (c1 + 1) * CELL, walls.z0 + (r1 + 1) * CELL, WALL_HEIGHT);
    }
  }
  for (const p of level.props) {
    const f = footprint(p);
    if (f) box(f.x0, f.z0, f.x1, f.z1, 1.1);
  }
  // The floor
  world.createCollider(RAPIER.ColliderDesc.cuboid(40, 0.5, 30).setTranslation(0, -0.5, 0), body);
}

export async function createPhysics(level: Level): Promise<Physics> {
  ready ??= RAPIER.init();
  await ready;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  addBuilding(world, level);
  world.step(); // build the query structures

  return {
    world,
    walker(x, z, radius = 0.3, height = 1.7) {
      const half = Math.max(0.01, (height - 2 * radius) / 2);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, radius + half + 0.02, z));
      const collider = world.createCollider(RAPIER.ColliderDesc.capsule(half, radius), body);
      const controller = world.createCharacterController(0.02);
      controller.setSlideEnabled(true);
      controller.setUp({ x: 0, y: 1, z: 0 });
      controller.enableSnapToGround(0.1);
      const lift = radius + half + 0.02;
      return {
        position() {
          const t = body.translation();
          return { x: t.x, y: t.y - lift, z: t.z };
        },
        move(dx, dz) {
          controller.computeColliderMovement(collider, { x: dx, y: -0.05, z: dz });
          const m = controller.computedMovement();
          const t = body.translation();
          body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
          world.step(); // applies the kinematic move and refreshes the queries
          return { x: m.x, z: m.z };
        },
        place(px, pz) {
          body.setTranslation({ x: px, y: lift, z: pz }, true);
          world.step();
        },
        remove() {
          world.removeCharacterController(controller);
          world.removeRigidBody(body);
        },
      };
    },
  };
}
