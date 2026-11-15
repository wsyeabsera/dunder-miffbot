import * as THREE from "three";
import { employees, type Employee, type Status } from "./state.ts";
import {
  makeBin, makeBookshelf, makeChair, makeCharacter, makeClock, makeCoffeeMachine, makeCorkboard, makeCouch, makeDesk,
  makeFilingCabinet, makeFloorLamp, makeLabel, makeMug, makePlant, makePoster, makePrinter, makeRug, makeSideTable,
  makeSign, makeWaterCooler, makeWhiteboard, makeWindow,
  type Character,
} from "./models.ts";

const ROOM_W = 16;
const ROOM_D = 14;
const WALL_H = 3.6;
const COLUMNS = [-5, -2.5, 0, 2.5, 5];
const ROW_Z = [2.5, -2.5]; // row 0 is nearest the camera
export const DESK_SLOTS = COLUMNS.length * ROW_Z.length;
/** Which desk the nth employee takes: spread across both rows, not one after another. */
const DESK_ORDER = [0, 8, 2, 6, 4, 9, 1, 7, 3, 5];
const SEAT_OFFSET = 0.95;
const WALK_SPEED = 2.2;
/** How far the body sits above (or below) its standing height on a chair and on the couch. */
const SIT_LIFT = { desk: 0.03, couch: -0.12 };

const STATUS_COLOR: Record<Status, string> = { working: "#4ade80", idle: "#facc15", resting: "#94a3b8" };

type Place = "desk" | "coffee" | "couch";
type Pt = { x: number; z: number };
type Spot = Pt & { face: number };

/** Places to stand or sit away from the desks: a queue at the coffee machine and seats on the couch. */
const SPOTS: Record<"coffee" | "couch", Spot[]> = {
  coffee: [0, 1, 2, 3].map((i) => ({ x: -6.3 + i * 0.9, z: 0, face: -Math.PI / 2 })),
  couch: [-0.8, 0, 0.8].map((z) => ({ x: 6.9, z, face: -Math.PI / 2 })),
};

type Agent = {
  e: Employee;
  ch: Character;
  slot: number;
  place: Place;
  spot: number; // which of SPOTS[place] this agent uses
  path: Pt[];
  walking: boolean;
  pause: number;
  seat: number; // 0 standing .. 1 seated
  phase: number;
  marker: THREE.Mesh;
  zzz: THREE.Sprite;
  name: THREE.Sprite;
  mug: THREE.Group;
  heading: number;
  finalFace: number;
  nextBlink: number;
};

function seatPoint(slot: number): Spot {
  const row = Math.floor(slot / COLUMNS.length);
  const x = COLUMNS[slot % COLUMNS.length];
  return row === 0 ? { x, z: ROW_Z[0] - SEAT_OFFSET, face: 0 } : { x, z: ROW_Z[1] + SEAT_OFFSET, face: Math.PI };
}

function spotFor(a: Agent): Spot {
  return a.place === "desk" ? seatPoint(a.slot) : SPOTS[a.place][a.spot];
}

export type Office = { select(id: string | null): void };

export function createOffice(canvas: HTMLCanvasElement, container: HTMLElement, onSelect: (id: string | null) => void): Office {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d2433");

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(14, 14, 14);
  camera.lookAt(0, 1, 0);

  scene.add(new THREE.HemisphereLight("#e6eeff", "#4a5070", 1.25));
  const sun = new THREE.DirectionalLight("#fff1dc", 1.9);
  sun.position.set(9, 15, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  scene.add(sun);

  const steam = buildRoom(scene);

  // Desks and chairs. Screens are kept so they can glow with their occupant's status.
  const screens = new Map<number, THREE.MeshStandardMaterial>();
  for (let slot = 0; slot < DESK_SLOTS; slot++) {
    const row = Math.floor(slot / COLUMNS.length);
    const x = COLUMNS[slot % COLUMNS.length];
    const desk = makeDesk();
    desk.position.set(x, 0, ROW_Z[row]);
    desk.rotation.y = row === 0 ? Math.PI : 0;
    desk.traverse((o) => {
      o.userData.slot = slot;
      if (o.userData.isScreen) screens.set(slot, (o as THREE.Mesh).material as THREE.MeshStandardMaterial);
    });
    scene.add(desk);
    const chair = makeChair();
    const seat = seatPoint(slot);
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = row === 0 ? 0 : Math.PI;
    chair.rotation.y += (slot % 3 - 1) * 0.12; // not all lined up
    scene.add(chair);
  }

  // Selection ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: "#7aa2ff", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  ring.userData.noShadow = true;
  scene.add(ring);

  // Employees
  const agents: Agent[] = employees.slice(0, DESK_SLOTS).map((e, i) => {
    const slot = DESK_ORDER[i];
    const ch = makeCharacter(e.look);
    ch.group.traverse((o) => (o.userData.employeeId = e.id));
    const name = makeLabel(e.name);
    name.position.set(0, 2.85, 0);
    name.scale.set(2.2, 0.55, 1);
    name.visible = false;
    ch.group.add(name);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[e.status], depthTest: false }));
    marker.position.set(0, 2.5, 0);
    marker.renderOrder = 10;
    marker.userData.noShadow = true;
    ch.group.add(marker);
    const zzz = makeLabel("Zzz", "#cbd5e1");
    zzz.position.set(0.5, 2.4, 0);
    zzz.scale.set(1.0, 0.25, 1);
    zzz.visible = false;
    ch.group.add(zzz);
    const mug = makeMug(i % 2 ? "#e0556b" : "#f4f4f6");
    mug.position.set(0.02, -0.4, 0.06);
    mug.rotation.y = Math.PI / 2;
    mug.visible = false;
    ch.rightForearm.add(mug);
    const spot = seatPoint(slot);
    ch.group.position.set(spot.x, 0, spot.z);
    ch.group.rotation.y = spot.face;
    scene.add(ch.group);
    return {
      e, ch, slot, place: "desk", spot: 0, path: [], walking: false, pause: 0, seat: 0, phase: slot,
      marker, zzz, name, mug, heading: spot.face, finalFace: spot.face, nextBlink: 2 + i,
    } satisfies Agent;
  });

  // Shadows: everything that is solid casts and receives, except the markers
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  let selected: string | null = null;
  let hovered: string | null = null;

  /** Walk to a place. Returns false (and stays put) when every spot there is taken. */
  function walkTo(a: Agent, place: Place): boolean {
    if (place !== "desk") {
      const free = SPOTS[place].findIndex((_, i) => !agents.some((o) => o !== a && o.place === place && o.spot === i));
      if (free < 0) return false;
      a.spot = free;
    }
    a.place = place;
    const dest = spotFor(a);
    const p = a.ch.group.position;
    const path: Pt[] = [];
    // Everyone walks along the aisle (z = 0), which no desk blocks.
    if (Math.abs(p.z) > 0.01) path.push({ x: p.x, z: 0 });
    path.push({ x: dest.x, z: 0 });
    if (dest.z !== 0) path.push({ x: dest.x, z: dest.z });
    a.path = path;
    a.finalFace = dest.face;
    a.walking = true;
    return true;
  }

  function decide(a: Agent, dt: number) {
    if (a.e.status === "idle") {
      if (a.walking) return;
      a.pause -= dt;
      if (a.place !== "desk" && a.pause > 0) return;
      const options: Place[] =
        a.place === "coffee" ? ["couch", "coffee"] : a.place === "couch" ? ["coffee", "couch"] : Math.random() < 0.5 ? ["coffee", "couch"] : ["couch", "coffee"];
      if (!options.some((p) => (p === a.place ? true : walkTo(a, p)))) a.pause = 2;
      else if (a.place !== "desk") a.pause = 3 + Math.random() * 3;
    } else if (a.place !== "desk") {
      walkTo(a, "desk");
    }
  }

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const approach = (cur: number, target: number, k: number) => cur + (target - cur) * clamp01(k);

  function animate(a: Agent, dt: number, time: number) {
    const { ch } = a;
    const g = ch.group;

    // Movement
    if (a.walking) {
      const next = a.path[0];
      const dx = next.x - g.position.x;
      const dz = next.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        g.position.x = next.x;
        g.position.z = next.z;
        a.path.shift();
        if (a.path.length === 0) {
          a.walking = false;
          a.heading = a.finalFace;
          a.pause = 3 + Math.random() * 3;
        }
      } else {
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
        a.heading = Math.atan2(dx, dz);
        a.phase += dt * 9;
      }
    }
    let dh = a.heading - g.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    g.rotation.y += dh * clamp01(dt * 10);

    // Pose
    const sitting = !a.walking && (a.place === "desk" || a.place === "couch");
    a.seat = approach(a.seat, sitting ? 1 : 0, dt * 6);
    g.position.y = (a.place === "couch" ? SIT_LIFT.couch : SIT_LIFT.desk) * a.seat;

    const k = dt * 12;
    let armL = 0, armR = 0, foreL = 0, foreR = 0, legL = 0, legR = 0, head = 0, headTurn = 0, bob = 0;
    const atCoffee = !a.walking && a.place === "coffee";
    if (a.walking) {
      const s = Math.sin(a.phase);
      armL = s * 0.7; armR = -s * 0.7; foreL = -0.25 - Math.max(0, -s) * 0.3; foreR = -0.25 - Math.max(0, s) * 0.3;
      legL = -s * 0.6; legR = s * 0.6;
      bob = Math.abs(Math.cos(a.phase)) * 0.06;
    } else if (a.e.status === "working" && a.place === "desk") {
      armL = -0.5; armR = -0.5;
      foreL = -0.95 + Math.sin(time * 14 + a.slot) * 0.12;
      foreR = -0.95 + Math.sin(time * 14 + a.slot + Math.PI) * 0.12;
      head = 0.1 + Math.sin(time * 1.7 + a.slot) * 0.04;
      headTurn = Math.sin(time * 0.6 + a.slot * 2) * 0.12;
    } else if (a.e.status === "resting") {
      armL = -0.3; armR = -0.3; foreL = -0.8; foreR = -0.8; head = 0.95;
      bob = Math.sin(time * 1.5 + a.slot) * 0.015;
    } else if (atCoffee) {
      armL = 0.05; foreL = -0.2;
      const sip = Math.max(0, Math.sin(time * 0.9 + a.slot * 1.7));
      armR = -0.55 - sip * 0.2; foreR = -1.2 - sip * 0.8;
      head = -0.1 - sip * 0.15;
      headTurn = (1 - sip) * Math.sin(time * 0.5 + a.slot) * 0.3;
    } else if (a.place === "couch") {
      armL = -0.35; armR = -0.35; foreL = -0.9; foreR = -0.9;
      head = 0.05;
      headTurn = Math.sin(time * 0.4 + a.slot) * 0.25;
    } else {
      foreL = -0.15; foreR = -0.15;
    }
    const legSit = (-Math.PI / 2) * a.seat;
    ch.leftArm.rotation.x = approach(ch.leftArm.rotation.x, armL, k);
    ch.rightArm.rotation.x = approach(ch.rightArm.rotation.x, armR, k);
    ch.leftForearm.rotation.x = approach(ch.leftForearm.rotation.x, foreL, k);
    ch.rightForearm.rotation.x = approach(ch.rightForearm.rotation.x, foreR, k);
    ch.leftLeg.rotation.x = approach(ch.leftLeg.rotation.x, legSit + legL, k);
    ch.rightLeg.rotation.x = approach(ch.rightLeg.rotation.x, legSit + legR, k);
    ch.head.rotation.x = approach(ch.head.rotation.x, head, k);
    ch.head.rotation.y = approach(ch.head.rotation.y, headTurn, dt * 6);
    ch.body.position.y = approach(ch.body.position.y, bob, k);
    a.mug.visible = atCoffee;

    // Blink
    if (time > a.nextBlink) {
      const t = time - a.nextBlink;
      const closed = a.e.status === "resting" || t < 0.12;
      for (const eye of ch.eyes) eye.scale.y = closed ? 0.1 : 1.1;
      if (t >= 0.12) a.nextBlink = time + 2.5 + Math.random() * 3;
    } else if (a.e.status === "resting") {
      for (const eye of ch.eyes) eye.scale.y = 0.1;
    } else {
      for (const eye of ch.eyes) eye.scale.y = 1.1;
    }

    (a.marker.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[a.e.status]);
    a.zzz.visible = a.e.status === "resting" && a.place === "desk" && !a.walking;
    if (a.zzz.visible) a.zzz.position.y = 2.4 + ((time * 0.5) % 1) * 0.3;
    a.name.visible = a.e.id === selected || a.e.id === hovered;
  }

  // Selection and picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(ev: PointerEvent): string | null {
    const r = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(scene.children, true)) {
      const id = hit.object.userData.employeeId as string | undefined;
      if (id) return id;
      const slot = hit.object.userData.slot as number | undefined;
      if (slot !== undefined) return agents.find((a) => a.slot === slot)?.e.id ?? null;
    }
    return null;
  }
  canvas.addEventListener("pointerdown", (ev) => {
    const id = pick(ev);
    if (id !== selected) onSelect(id);
  });
  canvas.addEventListener("pointermove", (ev) => {
    hovered = pick(ev);
    canvas.style.cursor = hovered ? "pointer" : "default";
  });
  canvas.addEventListener("pointerleave", () => (hovered = null));

  function select(id: string | null) {
    selected = id;
    ring.visible = id !== null;
  }

  // Sizing: the room always fits, whatever the window shape
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    const fitH = 19;
    const fitW = 29;
    const viewH = aspect > fitW / fitH ? fitH : fitW / aspect;
    camera.left = (-viewH * aspect) / 2;
    camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    for (const a of agents) {
      decide(a, dt);
      animate(a, dt, time);
    }
    // Monitors: lively while someone works, dim when idle or resting, nearly off when the desk is empty
    for (const [slot, material] of screens) {
      const who = agents.find((a) => a.slot === slot)?.e.status;
      const target = who === "working" ? 0.9 + Math.sin(time * 9 + slot) * 0.12 : who === "idle" ? 0.35 : who === "resting" ? 0.08 : 0.15;
      material.emissiveIntensity = approach(material.emissiveIntensity, target, 0.2);
    }
    steam(time);
    const sel = agents.find((a) => a.e.id === selected);
    if (sel) ring.position.set(sel.ch.group.position.x, 0.04, sel.ch.group.position.z);
    renderer.render(scene, camera);
  });

  return { select };
}

/** Builds the room and everything in it that is not an employee. Returns the per-frame steam animation. */
function buildRoom(scene: THREE.Scene): (time: number) => void {
  const at = <T extends THREE.Object3D>(obj: T, x: number, z: number, rotY = 0, y = 0): T => {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    scene.add(obj);
    return obj;
  };
  const backZ = -ROOM_D / 2;
  const leftX = -ROOM_W / 2;
  const LEFT = Math.PI / 2; // faces +x, into the room from the left wall

  // Floor: two-tone tiles in one instanced mesh
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.2, 0.98), new THREE.MeshStandardMaterial({ roughness: 0.85 }), ROOM_W * ROOM_D);
  const m = new THREE.Matrix4();
  const colors = [new THREE.Color("#4a5a7e"), new THREE.Color("#414f72")];
  let i = 0;
  for (let x = 0; x < ROOM_W; x++) {
    for (let z = 0; z < ROOM_D; z++) {
      m.setPosition(x - ROOM_W / 2 + 0.5, -0.1, z - ROOM_D / 2 + 0.5);
      tiles.setMatrixAt(i, m);
      tiles.setColorAt(i, colors[(x + z) % 2]);
      i++;
    }
  }
  scene.add(tiles);

  // Walls: plaster above, darker wainscot below, skirting on top of the floor
  const wallMat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  const wall = (w: number, h: number, d: number, c: string, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat(c));
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };
  wall(ROOM_W + 0.6, WALL_H, 0.3, "#6a80b8", -0.3, WALL_H / 2, backZ - 0.15);
  wall(0.3, WALL_H, ROOM_D, "#5f74ab", leftX - 0.15, WALL_H / 2, 0);
  wall(ROOM_W, 1.1, 0.08, "#4a5a8a", 0, 0.55, backZ + 0.04);
  wall(0.08, 1.1, ROOM_D, "#45548a", leftX + 0.04, 0.55, 0);
  wall(ROOM_W, 0.06, 0.12, "#e8ecf4", 0, 1.12, backZ + 0.06); // chair rail
  wall(0.12, 0.06, ROOM_D, "#e8ecf4", leftX + 0.06, 1.12, 0);
  wall(ROOM_W, 0.2, 0.14, "#2a3350", 0, 0.1, backZ + 0.07);
  wall(0.14, 0.2, ROOM_D, "#2a3350", leftX + 0.07, 0.1, 0);
  wall(ROOM_W + 0.6, 0.12, 0.34, "#aab4cc", -0.3, WALL_H + 0.06, backZ - 0.15); // wall tops
  wall(0.34, 0.12, ROOM_D, "#aab4cc", leftX - 0.15, WALL_H + 0.06, 0);

  // Back wall
  at(makeWindow(), -5.4, backZ + 0.07);
  at(makeClock(), -3.0, backZ + 0.1, 0, 2.75);
  at(makeSign("DUNDER MIFFBOT"), -0.2, backZ + 0.08);
  at(makeWhiteboard(), 3.4, backZ + 0.08);
  at(makeCorkboard(), 6.6, backZ + 0.08);

  // Left wall
  at(makePoster("TEAMWORK", "Together everyone achieves more... eventually", "#e0556b"), leftX + 0.1, -2.4, LEFT);
  at(makePoster("HANG IN THERE", "Quarterly review is only 4 months away", "#2f7d8a"), leftX + 0.1, 2.6, LEFT);
  at(makeBookshelf(), leftX + 0.4, -4.9, LEFT);
  at(makeFilingCabinet(), leftX + 0.5, 4.4, LEFT);
  at(makeFilingCabinet(), leftX + 0.5, 5.2, LEFT);

  // Coffee corner
  const coffee = at(makeCoffeeMachine(), leftX + 0.75, 0, LEFT);
  at(makeBin(), leftX + 0.5, 1.5);
  const steamPuffs: THREE.Mesh[] = [];
  for (let n = 0; n < 5; n++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false }));
    puff.userData.noShadow = true;
    scene.add(puff);
    steamPuffs.push(puff);
  }

  // Along the back wall
  at(makePrinter(), -1.8, backZ + 0.7);
  at(makePlant("tall"), leftX + 0.7, backZ + 0.7);
  at(makeWaterCooler(), 6.2, backZ + 0.7);
  at(makeFilingCabinet(), 4.9, backZ + 0.5);
  at(makeBin(), -3.2, backZ + 0.5);

  // Lounge on the open right side
  at(makeCouch(), ROOM_W / 2 - 0.9, 0, -Math.PI / 2);
  at(makeFloorLamp(), ROOM_W / 2 - 0.6, -2.3);
  at(makeSideTable(), ROOM_W / 2 - 0.7, 2.3);
  at(makePlant("tall"), ROOM_W / 2 - 0.6, backZ + 0.8);
  at(makePlant("fern"), leftX + 0.7, ROOM_D / 2 - 0.8);
  at(makePlant("fern"), ROOM_W / 2 - 0.6, ROOM_D / 2 - 0.8);

  // Rugs: a runner down the aisle and a round-cornered mat by the couch
  at(makeRug(14.4, 1.7, "#2f5d62", "#e8e2d0"), 0.2, 0);
  at(makeRug(2.6, 3.4, "#6b3f4f", "#e8b04a"), ROOM_W / 2 - 2.0, 0);

  return (time) => {
    steamPuffs.forEach((puff, n) => {
      const t = (time * 0.35 + n / steamPuffs.length) % 1;
      puff.position.set(coffee.position.x + 0.35 + Math.sin(time + n) * 0.03, 1.25 + t * 0.9, 0.3 + Math.cos(time * 0.8 + n) * 0.03);
      puff.scale.setScalar(0.6 + t * 1.6);
      (puff.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - t);
    });
  };
}
