import * as THREE from "three";
import { employees, type Employee, type Status } from "./state.ts";
import { makeCharacter, makeLabel, makeMug, type Character } from "./models.ts";
import { CameraRig, type Mode, type Subject } from "./camera-rig.ts";
import { buildLevel, type Activity, type Spot } from "./world/level.ts";
import { buildWorld } from "./world/build.ts";
import type { Pt } from "./world/grid.ts";

const STATUS_COLOR: Record<Status, string> = { working: "#4ade80", idle: "#facc15", resting: "#94a3b8" };
/** Chance weights and how long (seconds) someone stays, per break activity. */
const BREAKS: { activity: Activity; weight: number; stay: [number, number] }[] = [
  { activity: "coffee", weight: 3, stay: [6, 10] },
  { activity: "lunch", weight: 2, stay: [12, 20] },
  { activity: "print", weight: 2, stay: [5, 8] },
  { activity: "restroom", weight: 1.5, stay: [5, 8] },
  { activity: "couch", weight: 2, stay: [12, 24] },
  { activity: "terrace", weight: 1.5, stay: [10, 20] },
  { activity: "library", weight: 1, stay: [6, 12] },
  { activity: "wander", weight: 1.5, stay: [4, 8] },
];
const SIT_LIFT = { chair: 0.03, soft: -0.12 };
const WALL_LOW = 0.38;

type Agent = {
  e: Employee;
  ch: Character;
  seat: Spot;
  spot: Spot; // where they are, or are heading
  path: Pt[];
  walking: boolean;
  stay: number;
  sit: number; // 0 standing .. 1 seated
  phase: number;
  speed: number;
  heading: number;
  marker: THREE.Mesh;
  zzz: THREE.Sprite;
  name: THREE.Sprite;
  mug: THREE.Group;
  nextBlink: number;
};

export type Office = {
  select(id: string | null): void;
  setMode(mode: Mode): void;
  readonly mode: Mode;
};

type Hooks = { onSelect(id: string | null): void; onMode(mode: Mode): void; fade?: HTMLElement };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createOffice(canvas: HTMLCanvasElement, container: HTMLElement, hooks: Hooks): Office {
  const level = buildLevel();
  const world = buildWorld(level);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d2433");
  scene.add(new THREE.HemisphereLight("#e6eeff", "#4a5070", 1.25));
  const sun = new THREE.DirectionalLight("#fff1dc", 1.9);
  sun.position.set(34, 46, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const box = sun.shadow.camera;
  box.left = -50; box.right = 50; box.top = 50; box.bottom = -50; box.near = 1; box.far = 140;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(world.root);

  // ---- People
  const reception = level.seats.find((s) => s.reception)!;
  const desks = level.seats.filter((s) => !s.reception);
  const spread = (i: number) => desks[(i * 11) % desks.length]; // spread the first employees across the floor
  let nextDesk = 0;

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: "#7aa2ff", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  ring.userData.noShadow = true;
  scene.add(ring);

  const agents: Agent[] = employees.slice(0, level.seats.length).map((e, i) => {
    const seat = e.post === "reception" ? reception : spread(nextDesk++);
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
    ch.group.position.set(seat.x, 0, seat.z);
    ch.group.rotation.y = seat.face;
    ch.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.noShadow) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(ch.group);
    return {
      e, ch, seat, spot: seat, path: [], walking: false, stay: rand(1, 14), sit: 1, phase: i * 1.7, speed: rand(1.25, 1.75),
      heading: seat.face, marker, zzz, name, mug, nextBlink: 2 + (i % 5),
    } satisfies Agent;
  });

  // ---- Reservations: one person per spot. Desks belong to their owner.
  const holder = new Map<string, Agent>();
  for (const a of agents) holder.set(a.seat.id, a);

  const route = (a: Agent, to: Spot): Pt[] => {
    const pos = a.ch.group.position;
    const pts: Pt[] = [];
    let start: Pt = { x: pos.x, z: pos.z };
    if (!a.walking && Math.hypot(pos.x - a.spot.x, pos.z - a.spot.z) < 0.3) {
      pts.push(a.spot.approach); // step out of the chair first
      start = a.spot.approach;
    }
    const mid = level.grid.path(start, to.approach);
    if (mid) pts.push(...mid);
    else pts.push(to.approach);
    if (to.approach.x !== to.x || to.approach.z !== to.z) pts.push({ x: to.x, z: to.z });
    return pts;
  };

  function goTo(a: Agent, to: Spot) {
    if (holder.get(a.spot.id) === a && a.spot !== a.seat) holder.delete(a.spot.id);
    holder.set(to.id, a);
    a.path = route(a, to);
    a.spot = to;
    a.walking = a.path.length > 0;
  }

  function pickBreak(a: Agent) {
    const options = BREAKS.map((b) => ({ ...b, free: level.spots.filter((s) => s.activity === b.activity && !holder.has(s.id)) })).filter((b) => b.free.length);
    const total = options.reduce((t, o) => t + o.weight, 0);
    let r = Math.random() * total;
    for (const o of options) {
      if ((r -= o.weight) <= 0) {
        goTo(a, o.free[Math.floor(Math.random() * o.free.length)]);
        a.stay = rand(o.stay[0], o.stay[1]);
        return;
      }
    }
  }

  function decide(a: Agent, dt: number) {
    if (a.walking) return;
    if (a.e.status !== "idle") {
      if (a.spot !== a.seat) goTo(a, a.seat);
      return;
    }
    a.stay -= dt;
    if (a.stay > 0) return;
    // Back to the desk now and then, otherwise somewhere else
    if (a.spot !== a.seat && Math.random() < 0.3) {
      goTo(a, a.seat);
      a.stay = rand(6, 14);
    } else {
      pickBreak(a);
      if (!a.walking) a.stay = rand(3, 6);
    }
  }

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const approach = (cur: number, target: number, k: number) => cur + (target - cur) * clamp01(k);
  const soft = (a: Agent) => a.spot.pose === "sitSoft";

  function move(a: Agent, dt: number) {
    const g = a.ch.group;
    if (a.walking) {
      const next = a.path[0];
      const dx = next.x - g.position.x;
      const dz = next.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      const step = a.speed * dt;
      if (dist <= step) {
        g.position.x = next.x;
        g.position.z = next.z;
        a.path.shift();
        if (!a.path.length) {
          a.walking = false;
          a.heading = a.spot.face;
        }
      } else {
        let mx = (dx / dist) * step;
        let mz = (dz / dist) * step;
        // Keep a little distance from people who are standing or walking nearby
        for (const o of agents) {
          if (o === a || o.sit > 0.5) continue;
          const ox = g.position.x - o.ch.group.position.x;
          const oz = g.position.z - o.ch.group.position.z;
          const d = Math.hypot(ox, oz);
          if (d < 0.7 && d > 0.001) {
            mx += (ox / d) * (0.7 - d) * dt * 2;
            mz += (oz / d) * (0.7 - d) * dt * 2;
          }
        }
        if (!level.walls.solidAt(g.position.x + mx, g.position.z + mz)) {
          g.position.x += mx;
          g.position.z += mz;
        } else {
          g.position.x += (dx / dist) * step;
          g.position.z += (dz / dist) * step;
        }
        a.heading = Math.atan2(dx, dz);
        a.phase += dt * a.speed * 5.5;
      }
    }
    let dh = a.heading - g.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    g.rotation.y += dh * clamp01(dt * 10);
  }

  function pose(a: Agent, dt: number, time: number, hidden: boolean) {
    const { ch } = a;
    const g = ch.group;
    const seated = !a.walking && ["desk", "sit", "sitSoft"].includes(a.spot.pose);
    a.sit = approach(a.sit, seated ? 1 : 0, dt * 6);
    g.position.y = (soft(a) ? SIT_LIFT.soft : SIT_LIFT.chair) * a.sit;

    const k = dt * 12;
    let armL = 0, armR = 0, foreL = -0.15, foreR = -0.15, legL = 0, legR = 0, head = 0, turn = 0, bob = 0;
    const p = a.spot.pose;
    const here = !a.walking;
    if (a.walking) {
      const s = Math.sin(a.phase);
      armL = s * 0.7; armR = -s * 0.7; foreL = -0.25 - Math.max(0, -s) * 0.3; foreR = -0.25 - Math.max(0, s) * 0.3;
      legL = -s * 0.6; legR = s * 0.6;
      bob = Math.abs(Math.cos(a.phase)) * 0.06;
    } else if (p === "desk") {
      if (a.e.status === "working") {
        armL = -0.5; armR = -0.5;
        foreL = -0.95 + Math.sin(time * 14 + a.phase) * 0.12;
        foreR = -0.95 + Math.sin(time * 14 + a.phase + Math.PI) * 0.12;
        head = 0.1 + Math.sin(time * 1.7 + a.phase) * 0.04;
        turn = Math.sin(time * 0.6 + a.phase * 2) * 0.12;
      } else if (a.e.status === "resting") {
        armL = -0.3; armR = -0.3; foreL = -0.8; foreR = -0.8; head = 0.95;
        bob = Math.sin(time * 1.5 + a.phase) * 0.015;
      } else {
        armL = -0.4; armR = -0.4; foreL = -0.7; foreR = -0.7; head = 0.05;
        turn = Math.sin(time * 0.5 + a.phase) * 0.35;
      }
    } else if (here && p === "sip") {
      const sip = Math.max(0, Math.sin(time * 0.9 + a.phase));
      armR = -0.55 - sip * 0.2; foreR = -1.2 - sip * 0.8;
      head = -0.1 - sip * 0.15;
      turn = (1 - sip) * Math.sin(time * 0.5 + a.phase) * 0.3;
    } else if (here && p === "sit") {
      armL = -0.4; armR = -0.5; foreL = -0.8;
      foreR = -1.0 - Math.max(0, Math.sin(time * 1.1 + a.phase)) * 0.8;
      head = 0.1;
      turn = Math.sin(time * 0.4 + a.phase) * 0.3;
    } else if (here && p === "sitSoft") {
      armL = -0.35; armR = -0.35; foreL = -0.9; foreR = -0.9;
      head = 0.05;
      turn = Math.sin(time * 0.4 + a.phase) * 0.25;
    } else if (here && a.spot.activity === "print") {
      armL = -0.5; armR = -0.5; foreL = -0.8 + Math.sin(time * 2 + a.phase) * 0.05; foreR = -0.8;
      head = 0.15;
    } else if (here && a.spot.activity === "library") {
      armL = -0.7; armR = -0.7; foreL = -1.2; foreR = -1.2;
      head = 0.3;
      turn = Math.sin(time * 0.5 + a.phase) * 0.2;
    } else {
      turn = Math.sin(time * 0.45 + a.phase) * 0.5;
    }
    const legSit = (-Math.PI / 2) * a.sit;
    ch.leftArm.rotation.x = approach(ch.leftArm.rotation.x, armL, k);
    ch.rightArm.rotation.x = approach(ch.rightArm.rotation.x, armR, k);
    ch.leftForearm.rotation.x = approach(ch.leftForearm.rotation.x, foreL, k);
    ch.rightForearm.rotation.x = approach(ch.rightForearm.rotation.x, foreR, k);
    ch.leftLeg.rotation.x = approach(ch.leftLeg.rotation.x, legSit + legL, k);
    ch.rightLeg.rotation.x = approach(ch.rightLeg.rotation.x, legSit + legR, k);
    ch.head.rotation.x = approach(ch.head.rotation.x, head, k);
    ch.head.rotation.y = approach(ch.head.rotation.y, turn, dt * 6);
    ch.body.position.y = approach(ch.body.position.y, bob, k);
    a.mug.visible = here && (p === "sip" || (p === "sit" && a.spot.activity === "lunch"));

    // Blink, and shut the eyes when resting
    const resting = a.e.status === "resting" && p === "desk" && here;
    let closed = resting;
    if (time > a.nextBlink) {
      const t = time - a.nextBlink;
      closed = closed || t < 0.12;
      if (t >= 0.12) a.nextBlink = time + 2.5 + Math.random() * 3;
    }
    for (const eye of ch.eyes) eye.scale.y = closed ? 0.1 : 1.1;

    (a.marker.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[a.e.status]);
    a.zzz.visible = resting && !hidden;
    if (a.zzz.visible) a.zzz.position.y = 2.4 + ((time * 0.5) % 1) * 0.3;
  }

  // ---- Camera and picking
  let selected: string | null = null;
  let hovered: string | null = null;
  const pickables: THREE.Object3D[] = [...agents.map((a) => a.ch.group), ...world.deskProxies];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const subject: Subject = { position: new THREE.Vector3(), heading: 0, eye: new THREE.Vector3(), pitch: 0, turn: 0 };

  const rig = new CameraRig(canvas, {
    fade: hooks.fade,
    onMode: (m) => hooks.onMode(m),
    onTap: (ev) => {
      const id = pick(ev);
      if (id !== selected) hooks.onSelect(id);
    },
    onHover: (ev) => {
      hovered = pick(ev);
      canvas.style.cursor = hovered ? "pointer" : "default";
    },
  });
  canvas.addEventListener("pointerleave", () => (hovered = null));

  function pick(ev: PointerEvent): string | null {
    const r = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, rig.camera);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      const id = hit.object.userData.employeeId as string | undefined;
      if (id) return id;
      const seatId = hit.object.userData.seatId as string | undefined;
      if (seatId) return holder.get(seatId)?.e.id ?? null;
    }
    return null;
  }

  function setMode(mode: Mode) {
    if (mode !== "iso" && !selected) hooks.onSelect(agents[0].e.id);
    rig.setMode(mode);
  }
  window.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (ev.key === "Escape") setMode("iso");
    else if (ev.key === "1") setMode("iso");
    else if (ev.key === "2") setMode("follow");
    else if (ev.key === "3") setMode("pov");
  });

  function select(id: string | null) {
    selected = id;
    ring.visible = id !== null;
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    rig.resize(w, h);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const eye = new THREE.Vector3();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    const focus = rig.mode === "iso" ? null : agents.find((a) => a.e.id === selected) ?? null;

    for (const a of agents) {
      decide(a, dt);
      move(a, dt);
      const inPov = rig.mode === "pov" && a === focus;
      pose(a, dt, time, inPov);
      a.ch.head.visible = !inPov;
      a.marker.visible = !inPov;
      a.name.visible = !inPov && (a.e.id === selected || a.e.id === hovered);
    }

    if (focus) {
      focus.ch.group.updateMatrixWorld(true);
      eye.set(0, 0.26, 0.2);
      focus.ch.head.localToWorld(eye);
      subject.position.copy(focus.ch.group.position);
      subject.heading = focus.ch.group.rotation.y;
      subject.eye.copy(eye);
      subject.pitch = focus.ch.head.rotation.x;
      subject.turn = focus.ch.head.rotation.y;
    }
    rig.update(dt, focus ? subject : null);

    // Walls: low in the overhead view so you can see into the rooms, full height from inside
    const overhead = rig.mode === "iso";
    world.walls.interior.scale.y = approach(world.walls.interior.scale.y, overhead ? WALL_LOW : 1, dt * 6);
    world.walls.front.visible = !overhead;

    // Monitors glow with their owner's work
    for (const seat of level.seats) {
      const owner = holder.get(seat.id);
      const here = owner && owner.spot === seat && !owner.walking;
      const target = here ? (owner.e.status === "working" ? 0.9 + Math.sin(time * 9 + owner.phase) * 0.12 : owner.e.status === "idle" ? 0.35 : 0.08) : 0.18;
      const m = world.screens.get(seat.id);
      if (m) m.emissiveIntensity = approach(m.emissiveIntensity, target, 0.2);
    }
    world.steam(time);

    const sel = agents.find((a) => a.e.id === selected);
    ring.visible = sel !== undefined && rig.mode !== "pov";
    if (sel) ring.position.set(sel.ch.group.position.x, 0.04, sel.ch.group.position.z);
    renderer.render(scene, rig.camera);
  });

  return {
    select,
    setMode,
    get mode() {
      return rig.mode;
    },
  };
}
