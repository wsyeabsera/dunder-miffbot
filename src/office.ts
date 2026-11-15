import * as THREE from "three";
import { employees, type Employee, type Status } from "./state.ts";
import {
  makeChair, makeCharacter, makeCoffeeMachine, makeCouch, makeDesk, makeLabel, makePlant, makeWhiteboard,
  type Character,
} from "./models.ts";

const ROOM_W = 16;
const ROOM_D = 14;
const COLUMNS = [-5, -2.5, 0, 2.5, 5];
const ROW_Z = [2.5, -2.5]; // front row first, so the first employees sit nearest the camera
export const DESK_SLOTS = COLUMNS.length * ROW_Z.length;
const SEAT_OFFSET = 0.95;
const WALK_SPEED = 2.2;

const STATUS_COLOR: Record<Status, string> = { working: "#4ade80", idle: "#facc15", resting: "#94a3b8" };

type Place = "desk" | "coffee" | "couch";
type Pt = { x: number; z: number };

type Spot = Pt & { face: number };

/** Places to stand or sit away from the desks: a queue at the coffee machine and seats on the couch. */
const SPOTS: Record<"coffee" | "couch", Spot[]> = {
  coffee: [0, 1, 2, 3].map((i) => ({ x: -6.4 + i * 0.9, z: 0, face: -Math.PI / 2 })),
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
  heading: number;
  finalFace: number;
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d2433");

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(14, 14, 14);
  camera.lookAt(0, 1, 0);

  scene.add(new THREE.HemisphereLight("#dbe7ff", "#3a3f55", 1.1));
  const sun = new THREE.DirectionalLight("#fff3e0", 1.4);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  buildRoom(scene);

  // Desks and chairs
  const deskMeshes: THREE.Object3D[] = [];
  for (let slot = 0; slot < DESK_SLOTS; slot++) {
    const row = Math.floor(slot / COLUMNS.length);
    const x = COLUMNS[slot % COLUMNS.length];
    const desk = makeDesk();
    desk.position.set(x, 0, ROW_Z[row]);
    desk.rotation.y = row === 0 ? Math.PI : 0;
    desk.traverse((o) => (o.userData.slot = slot));
    scene.add(desk);
    deskMeshes.push(desk);
    const chair = makeChair();
    const seat = seatPoint(slot);
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = row === 0 ? 0 : Math.PI;
    scene.add(chair);
  }

  // Employees
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: "#7aa2ff", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  scene.add(ring);

  const agents: Agent[] = employees.slice(0, DESK_SLOTS).map((e, slot) => {
    const ch = makeCharacter(e.look);
    ch.group.traverse((o) => (o.userData.employeeId = e.id));
    const name = makeLabel(e.name);
    name.position.set(0, 2.75, 0);
    name.scale.set(2.2, 0.55, 1);
    ch.group.add(name);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[e.status], depthTest: false }));
    marker.position.set(0, 2.4, 0);
    marker.renderOrder = 10;
    ch.group.add(marker);
    const zzz = makeLabel("Zzz", "#cbd5e1");
    zzz.position.set(0.5, 2.3, 0);
    zzz.scale.set(1.0, 0.25, 1);
    zzz.visible = false;
    ch.group.add(zzz);
    const spot = seatPoint(slot);
    ch.group.position.set(spot.x, 0, spot.z);
    ch.group.rotation.y = spot.face;
    scene.add(ch.group);
    return { e, ch, slot, place: "desk", spot: 0, path: [], walking: false, pause: 0, seat: 0, phase: slot, marker, zzz, heading: spot.face, finalFace: spot.face };
  });

  let selected: string | null = null;

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
      const options: Place[] = a.place === "coffee" ? ["couch", "coffee"] : a.place === "couch" ? ["coffee", "couch"] : Math.random() < 0.5 ? ["coffee", "couch"] : ["couch", "coffee"];
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
    g.position.y = (a.place === "couch" ? 0.0 : 0.1) * a.seat;

    const k = dt * 12;
    let armL = 0, armR = 0, legL = 0, legR = 0, head = 0, bob = 0;
    if (a.walking) {
      const s = Math.sin(a.phase);
      armL = s * 0.7; armR = -s * 0.7; legL = -s * 0.6; legR = s * 0.6;
      bob = Math.abs(Math.cos(a.phase)) * 0.06;
    } else if (a.e.status === "working" && a.place === "desk") {
      armL = -1.15 + Math.sin(time * 14 + a.slot) * 0.14;
      armR = -1.15 + Math.sin(time * 14 + a.slot + Math.PI) * 0.14;
      head = 0.12 + Math.sin(time * 1.7 + a.slot) * 0.04;
    } else if (a.e.status === "resting") {
      armL = -0.25; armR = -0.25; head = 0.95;
      bob = Math.sin(time * 1.5 + a.slot) * 0.015;
    } else if (a.place === "coffee") {
      armR = -2.3 + Math.sin(time * 2) * 0.08; head = -0.15;
    } else if (a.place === "couch") {
      armL = -0.4; armR = -0.4;
    }
    const legSit = -Math.PI / 2 * a.seat;
    ch.leftArm.rotation.x = approach(ch.leftArm.rotation.x, armL, k);
    ch.rightArm.rotation.x = approach(ch.rightArm.rotation.x, armR, k);
    ch.leftLeg.rotation.x = approach(ch.leftLeg.rotation.x, legSit + legL, k);
    ch.rightLeg.rotation.x = approach(ch.rightLeg.rotation.x, legSit + legR, k);
    ch.head.rotation.x = approach(ch.head.rotation.x, head, k);
    ch.body.position.y = approach(ch.body.position.y, bob, k);

    (a.marker.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[a.e.status]);
    a.zzz.visible = a.e.status === "resting" && a.place === "desk" && !a.walking;
    if (a.zzz.visible) a.zzz.position.y = 2.3 + ((time * 0.5) % 1) * 0.3;
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
    canvas.style.cursor = pick(ev) ? "pointer" : "default";
  });

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
    const sel = agents.find((a) => a.e.id === selected);
    if (sel) ring.position.set(sel.ch.group.position.x, 0.03, sel.ch.group.position.z);
    renderer.render(scene, camera);
  });

  return { select };
}

function buildRoom(scene: THREE.Scene) {
  // Two-tone floor tiles in a single instanced mesh
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.2, 0.98), new THREE.MeshStandardMaterial({ roughness: 0.9 }), ROOM_W * ROOM_D);
  const m = new THREE.Matrix4();
  const colors = [new THREE.Color("#46567a"), new THREE.Color("#3d4c6e")];
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

  const wallColor = "#566a99";
  const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W + 0.6, 3.6, 0.3), new THREE.MeshStandardMaterial({ color: wallColor }));
  back.position.set(-0.3, 1.8, -ROOM_D / 2 - 0.15);
  scene.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, ROOM_D), new THREE.MeshStandardMaterial({ color: "#4b5c85" }));
  left.position.set(-ROOM_W / 2 - 0.15, 1.8, 0);
  scene.add(left);
  const baseboard = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.25, 0.1), new THREE.MeshStandardMaterial({ color: "#2a3350" }));
  baseboard.position.set(0, 0.125, -ROOM_D / 2 + 0.05);
  scene.add(baseboard);

  const board = makeWhiteboard();
  board.position.set(1.5, 0, -ROOM_D / 2 + 0.06);
  scene.add(board);

  const coffee = makeCoffeeMachine();
  coffee.position.set(-ROOM_W / 2 + 0.7, 0, 0);
  coffee.rotation.y = Math.PI / 2;
  scene.add(coffee);

  const couch = makeCouch();
  couch.position.set(ROOM_W / 2 - 0.9, 0, 0);
  couch.rotation.y = -Math.PI / 2;
  scene.add(couch);

  for (const [x, z] of [[-ROOM_W / 2 + 0.7, -ROOM_D / 2 + 0.7], [-ROOM_W / 2 + 0.7, ROOM_D / 2 - 1], [ROOM_W / 2 - 0.8, -ROOM_D / 2 + 0.8]]) {
    const plant = makePlant();
    plant.position.set(x, 0, z);
    scene.add(plant);
  }
}
