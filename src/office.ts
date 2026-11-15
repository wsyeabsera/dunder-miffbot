import * as THREE from "three";
import { employees, type Employee, type Status } from "./state.ts";
import { makeBubble, makeLabel, updateBubble } from "./models.ts";
import { createActor, lookToActor, type Actor, type Kit } from "./actors.ts";
import { CameraRig, type Mode, type Subject } from "./camera-rig.ts";
import { buildLevel, type Activity, type Level, type Spot } from "./world/level.ts";
import { buildWorld } from "./world/build.ts";
import type { Pt } from "./world/grid.ts";
import type { Walker } from "./engine/physics.ts";

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
  { activity: "wander", weight: 1, stay: [4, 8] },
  { activity: "chat", weight: 2.5, stay: [9, 15] },
];
/** How far to raise a seated person so they sit on the seat: the sitting clip is made for a low seat. Tuned by eye. */
const SIT_LIFT = { chair: 0.2, soft: 0.0 };
const WALL_LOW = 0.38;

type Agent = {
  e: Employee;
  actor: Actor;
  seat: Spot;
  spot: Spot; // where they are, or are heading
  path: Pt[];
  walking: boolean;
  stay: number;
  sit: number; // 0 standing .. 1 seated
  phase: number;
  speed: number;
  heading: number;
  lift: number; // current height offset from sitting
  variant: number; // picks between similar clips so neighbours do not move in sync
  marker: THREE.Mesh;
  zzz: THREE.Sprite;
  name: THREE.Sprite;
  clip: string;
  bubble: string;
};

export type Office = {
  select(id: string | null): void;
  setMode(mode: Mode): void;
  /** Look at someone: move the overhead view to them. */
  focus(id: string): void;
  /** Move the overhead view to a point on the floor. */
  focusPoint(x: number, z: number): void;
  /** Everyone's place on the floor, plus the boss when walking, for the minimap. */
  positions(): { id: string; x: number; z: number; status: Status }[];
  boss(): { x: number; z: number; heading: number } | null;
  readonly level: Level;
  readonly mode: Mode;
};

type Hooks = { onSelect(id: string | null): void; onMode(mode: Mode): void; fade?: HTMLElement };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Where the boss appears in walk mode: inside the manager's office, facing the door. */
const BOSS = { x: 9, z: -12, heading: 0 };

export async function createOffice(canvas: HTMLCanvasElement, container: HTMLElement, hooks: Hooks, kit: Kit): Promise<Office> {
  const level = buildLevel();
  // Physics (Rapier, WebAssembly, about 4 MB) is only needed for walk mode, so it loads the first time you walk.
  let realWalker: Walker | null = null;
  let physicsLoading: Promise<void> | null = null;
  const loadPhysics = () =>
    (physicsLoading ??= import("./engine/physics.ts").then(async (m) => {
      realWalker = (await m.createPhysics(level)).walker(BOSS.x, BOSS.z);
    }));
  const walker: Walker = {
    position: () => realWalker?.position() ?? { x: BOSS.x, y: 0, z: BOSS.z },
    move: (dx, dz) => realWalker?.move(dx, dz) ?? { x: 0, z: 0 },
    place: (x, z) => realWalker?.place(x, z),
    remove: () => realWalker?.remove(),
  };
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

  // A little mood light in the main rooms: warm kitchen and offices, cool server room, pink lounge
  const MOOD: Record<string, [string, number]> = {
    kitchen: ["#ffe2b0", 38], manager: ["#ffcf8a", 38], server: ["#5fa0ff", 55], lounge: ["#ff9fd0", 45], lobby: ["#ffd9a8", 38], terrace: ["#ffd9a0", 30],
  };
  for (const r of level.rooms) {
    const mood = MOOD[r.id];
    if (!mood) continue;
    const light = new THREE.PointLight(mood[0], mood[1], 13, 1.6);
    light.position.set((r.rect.x0 + r.rect.x1) / 2, 2.9, (r.rect.z0 + r.rect.z1) / 2);
    scene.add(light);
  }

  // Room names on the floor, shown in the overhead view
  const roomLabels = new THREE.Group();
  roomLabels.name = "room labels";
  for (const r of level.rooms) {
    const label = makeLabel(r.name, "#e8ecf4");
    label.scale.set(3, 0.75, 1);
    label.position.set((r.rect.x0 + r.rect.x1) / 2, 0.3, (r.rect.z0 + r.rect.z1) / 2);
    (label.material as THREE.SpriteMaterial).opacity = 0.75;
    roomLabels.add(label);
  }
  scene.add(roomLabels);

  // Materials of blinking lights (racks, machines): merged with the static props, so one material per colour
  const ledMaterials = new Set<THREE.MeshStandardMaterial>();
  world.root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.merged && (o.material as THREE.MeshStandardMaterial).emissiveIntensity === 1.2) ledMaterials.add(o.material as THREE.MeshStandardMaterial);
  });

  // Everyone lives in one named group in the scene, so the whole crowd can be found, hidden or moved together.
  const people = new THREE.Group();
  people.name = "people";
  scene.add(people);

  const agents: Agent[] = employees.slice(0, level.seats.length).map((e, i) => {
    const seat = e.post === "reception" ? reception : spread(nextDesk++);
    const actor = createActor(kit, lookToActor(e.look, i));
    const g = actor.group;
    const name = makeBubble();
    name.position.set(0, 2.45, 0);
    name.visible = false;
    g.add(name);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[e.status], depthTest: false }));
    marker.position.set(0, 2.0, 0);
    marker.renderOrder = 10;
    marker.userData.noShadow = true;
    g.add(marker);
    const zzz = makeLabel("Zzz", "#cbd5e1");
    zzz.position.set(0.5, 1.95, 0);
    zzz.scale.set(1.0, 0.25, 1);
    zzz.visible = false;
    g.add(zzz);
    // Clicking is tested against one invisible box per person, not their 20k-triangle skinned meshes.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = 0.95;
    proxy.userData.employeeId = e.id;
    g.add(proxy);
    g.position.set(seat.x, 0, seat.z);
    g.rotation.y = seat.face;
    g.name = e.name;
    people.add(g);
    return {
      e, actor, seat, spot: seat, path: [], walking: false, stay: rand(1, 14), sit: 1, phase: i * 1.7, speed: rand(1.25, 1.75),
      heading: seat.face, lift: SIT_LIFT.chair, variant: i, marker, zzz, name, clip: "", bubble: "",
    } satisfies Agent;
  });

  // ---- Reservations: one person per spot. Desks belong to their owner.
  const holder = new Map<string, Agent>();
  for (const a of agents) holder.set(a.seat.id, a);

  const route = (a: Agent, to: Spot): Pt[] => {
    const pos = a.actor.group.position;
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
        const spot = o.free[Math.floor(Math.random() * o.free.length)];
        goTo(a, spot);
        a.stay = rand(o.stay[0], o.stay[1]);
        // A chat needs two: call over someone on a break to stand opposite
        const partner = spot.partner ? level.spots.find((s) => s.id === spot.partner) : undefined;
        if (partner && !holder.has(partner.id)) {
          const mate = agents.find((b) => b !== a && b.e.status === "idle" && !b.walking && b.stay > 0 && !b.spot.partner);
          if (mate) {
            goTo(mate, partner);
            mate.stay = a.stay;
          }
        }
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
    const g = a.actor.group;
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
          const ox = g.position.x - o.actor.group.position.x;
          const oz = g.position.z - o.actor.group.position.z;
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

  const STAND = ["Idle_Loop", "Idle_FoldArms_Loop", "Idle_Talking_Loop"];
  const SIT = ["Sitting_Idle_Loop", "Sitting_Talking_Loop"];

  /** The animation clip for what this person is doing right now. */
  function clipFor(a: Agent): string {
    if (a.walking) return "Walk_Formal_Loop";
    const p = a.spot.pose;
    if (p === "desk") return a.e.status === "idle" && a.variant % 3 === 0 ? "Sitting_Talking_Loop" : "Sitting_Idle_Loop";
    if (p === "sip") return "Consume";
    if (p === "sit") return SIT[a.variant % 2];
    if (p === "sitSoft") return a.variant % 2 ? "Sitting_Talking_Loop" : "Sitting_Idle_Loop";
    switch (a.spot.activity) {
      case "chat": return "Idle_Talking_Loop";
      case "print": return "Interact";
      case "wander": return ["Idle_TalkingPhone_Loop", "Idle_FoldArms_Loop", "Idle_No_Loop", "Idle_Loop"][a.variant % 4];
      case "library": return "Idle_FoldArms_Loop";
      default: return STAND[a.variant % STAND.length];
    }
  }

  const DOING: Record<string, string> = {
    coffee: "Getting coffee", lunch: "Having lunch", print: "At the printer", restroom: "Back in a minute", couch: "Watching TV", terrace: "Getting some air", library: "Browsing books", wander: "Stretching legs", chat: "Having a chat", desk: "At the desk",
  };
  /** One line about what someone is doing, for their bubble. */
  function describe(a: Agent): string {
    if (a.e.status === "working") return a.e.task ?? "Working";
    if (a.e.status === "resting") return "Resting until tomorrow";
    return DOING[a.spot.activity] ?? "On a break";
  }

  function pose(a: Agent, dt: number, hidden: boolean) {
    const g = a.actor.group;
    const seated = !a.walking && ["desk", "sit", "sitSoft"].includes(a.spot.pose);
    a.sit = approach(a.sit, seated ? 1 : 0, dt * 6);
    const wantLift = (soft(a) ? SIT_LIFT.soft : SIT_LIFT.chair) * a.sit;
    a.lift = approach(a.lift, wantLift, dt * 8);
    g.position.y = a.lift;

    const clip = clipFor(a);
    if (clip !== a.clip) {
      a.clip = clip;
      a.actor.play(clip, 0.3);
    }
    a.actor.update(dt * (a.walking ? Math.max(0.6, a.speed / 1.5) : 1));
    // At the desk: type while working, slump while resting
    const atDesk = !a.walking && a.spot.pose === "desk";
    a.actor.overlay(atDesk && a.e.status === "working" ? "typing" : atDesk && a.e.status === "resting" ? "sleeping" : "none", performance.now() / 1000, a.phase);

    const resting = a.e.status === "resting" && a.spot.pose === "desk" && !a.walking;
    (a.marker.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[a.e.status]);
    a.zzz.visible = resting && !hidden;
    if (a.zzz.visible) a.zzz.position.y = 1.95 + ((performance.now() / 2000) % 1) * 0.3;
  }

  // ---- Camera and picking
  let selected: string | null = null;
  let hovered: string | null = null;
  const pickables: THREE.Object3D[] = [...agents.map((a) => a.actor.group.children.find((c) => c.userData.employeeId)!), ...world.deskProxies];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const subject: Subject = { position: new THREE.Vector3(), heading: 0, eye: new THREE.Vector3(), pitch: 0, turn: 0 };

  const rig = new CameraRig(canvas, {
    fade: hooks.fade,
    blocked: (x, z) => level.walls.solidAt(x, z),
    walker,
    spawn: BOSS,
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

  async function setMode(mode: Mode) {
    if (mode === "walk") await loadPhysics();
    if ((mode === "follow" || mode === "pov") && !selected) hooks.onSelect(agents[0].e.id);
    rig.setMode(mode);
  }
  window.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (ev.key === "Escape") setMode("iso");
    else if (ev.key === "1") setMode("iso");
    else if (ev.key === "2") setMode("follow");
    else if (ev.key === "3") setMode("pov");
    else if (ev.key === "4") setMode("walk");
    else if (ev.key.toLowerCase() === "e") interact();
  });
  canvas.addEventListener("click", () => {
    if (document.pointerLockElement === canvas) interact();
  });

  // Walking or looking through someone's eyes: the crosshair names whoever you look at, and E (or a click) opens them.
  const crosshair = document.querySelector<HTMLElement>("#crosshair");
  const centre = new THREE.Vector2(0, 0);
  let looked: string | null = null;
  function lookAt(): string | null {
    raycaster.setFromCamera(centre, rig.camera);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      const id = hit.object.userData.employeeId as string | undefined;
      if (id && hit.distance < 12) return id;
      if (hit.object.userData.seatId) break;
    }
    return null;
  }
  function interact() {
    if ((rig.mode !== "walk" && rig.mode !== "pov") || !looked) return;
    hooks.onSelect(looked);
    if (document.pointerLockElement === canvas) document.exitPointerLock(); // free the mouse so the task box can be used
  }

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
    const first = rig.mode === "walk" || rig.mode === "pov";

    for (const a of agents) {
      decide(a, dt);
      move(a, dt);
      const inPov = rig.mode === "pov" && a === focus;
      pose(a, dt, inPov);
      a.marker.visible = rig.mode === "iso" || (rig.mode === "follow" && a === focus);
      a.name.visible = !inPov && (a.e.id === selected || a.e.id === hovered || (first && a.e.id === looked));
      if (a.name.visible) {
        const k = rig.labelScale(rig.camera.position.distanceTo(a.actor.group.position));
        a.name.scale.set(2.3 * k, 0.67 * k, 1);
        const text = describe(a);
        if (text !== a.bubble) {
          a.bubble = text;
          updateBubble(a.name, a.e.name, text);
        }
      }
    }

    if (focus) {
      // Eyes: the head bone, moved a little forward and up so the camera sits in front of the face, not inside the skull.
      focus.actor.group.updateMatrixWorld(true);
      focus.actor.head.getWorldPosition(eye);
      const h = focus.actor.group.rotation.y;
      eye.x += Math.sin(h) * 0.17;
      eye.z += Math.cos(h) * 0.17;
      eye.y += 0.1;
      subject.position.copy(focus.actor.group.position);
      subject.heading = h;
      subject.eye.copy(eye);
      subject.pitch = 0;
      subject.turn = 0;
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
    // Server and machine lights blink
    const blink = Math.sin(time * 7) > 0 ? 1.2 : 0.35;
    for (const m of ledMaterials) m.emissiveIntensity = blink;

    // Crosshair and who is under it
    if (crosshair) {
      crosshair.hidden = !first;
      looked = first ? lookAt() : null;
      const who = looked ? agents.find((a) => a.e.id === looked)?.e.name ?? "" : "";
      crosshair.dataset.target = who;
      crosshair.querySelector(".who")!.textContent = who;
    }
    roomLabels.visible = rig.mode === "iso";

    const sel = agents.find((a) => a.e.id === selected);
    ring.visible = sel !== undefined && rig.mode !== "pov";
    if (sel) ring.position.set(sel.actor.group.position.x, 0.04, sel.actor.group.position.z);
    renderer.render(scene, rig.camera);
  });

  return {
    select,
    setMode,
    level,
    focusPoint: (x, z) => rig.focus(x, z),
    focus(id) {
      const a = agents.find((x) => x.e.id === id);
      if (a) rig.focus(a.actor.group.position.x, a.actor.group.position.z);
    },
    positions: () => agents.map((a) => ({ id: a.e.id, x: a.actor.group.position.x, z: a.actor.group.position.z, status: a.e.status })),
    boss: () => (rig.mode === "walk" ? { ...rig.walkPosition(), heading: 0 } : null),
    get mode() {
      return rig.mode;
    },
  };
}
