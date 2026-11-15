// Turns the level data into three.js objects. Static geometry is merged per 24-unit chunk and material, so the big building
// stays within a sane draw-call budget and chunks can still be culled.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  makeBench, makeBin, materialKey, makeBookshelf, makeChair, makeClock, makeCoffeeMachine, makeCorkboard, makeCounter, makeCouch, makeDesk,
  makeFilingCabinet, makeFloorLamp, makeFridge, makeLogoRug, makeManagerDesk, makePingPong, makePlant, makePoster, makePrinter, makeRack,
  makeRug, makeSideTable, makeSign, makeSink, makeStall, makeTable, makeTV, makeVending, makeWaterCooler, makeWhiteboard, makeWindow,
} from "../models.ts";
import { CELL } from "./grid.ts";
import { BOUNDS, WALL_HEIGHT, roomAt, type Level, type Prop } from "./level.ts";

const HALL_FLOOR = "#7d8aa0";
const CHUNK = 24;

export type World = {
  root: THREE.Group;
  /** Back walls (north and west edge) stay tall; interior walls shrink in the overhead view; front walls vanish there. */
  walls: { back: THREE.Group; interior: THREE.Group; front: THREE.Group };
  /** Invisible boxes over each desk so a click on a desk finds its seat. */
  deskProxies: THREE.Mesh[];
  /** Screen glow materials by seat id. */
  screens: Map<string, THREE.MeshStandardMaterial>;
  steam: (time: number) => void;
};

function makeProp(p: Prop): THREE.Object3D {
  switch (p.kind) {
    case "desk": return makeDesk();
    case "managerdesk": return makeManagerDesk();
    case "chair": return makeChair();
    case "couch": return makeCouch();
    case "plant-tall": return makePlant("tall");
    case "plant-fern": return makePlant("fern");
    case "plant-succulent": return makePlant("succulent");
    case "cabinet": return makeFilingCabinet();
    case "bookshelf": return makeBookshelf();
    case "printer": return makePrinter();
    case "cooler": return makeWaterCooler();
    case "coffee": return makeCoffeeMachine();
    case "bin": return makeBin();
    case "counter": return makeCounter(p.w);
    case "fridge": return makeFridge();
    case "vending": return makeVending();
    case "table": return makeTable(p.w, p.d);
    case "tv": return makeTV();
    case "pingpong": return makePingPong();
    case "rack": return makeRack();
    case "bench": return makeBench();
    case "stall": return makeStall();
    case "sink": return makeSink();
    case "lamp": return makeFloorLamp();
    case "sidetable": return makeSideTable();
    case "rug": return makeRug(p.w ?? 4, p.d ?? 3, p.color ?? "#2f5d62", p.border ?? "#e8e2d0");
    case "logo-rug": return makeLogoRug(p.w ?? 6, p.d ?? 3, p.text ?? "", p.color ?? "#1f2633", p.border ?? "#7aa2ff");
    case "whiteboard": return makeWhiteboard();
    case "window": return makeWindow();
    case "clock": return makeClock();
    case "poster": return makePoster(p.text ?? "", p.sub ?? "", p.color ?? "#e0556b");
    case "corkboard": return makeCorkboard();
    case "sign": return makeSign(p.text ?? "");
  }
}

/** Bakes every mergeable mesh under `root` into one mesh per chunk and material. Screens, textured and animated things stay as they are. */
function mergeStatic(root: THREE.Object3D) {
  const buckets = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[] }>();
  const doomed: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.noMerge || o.userData.isScreen || o.userData.slot !== undefined) return;
    const m = o.material as THREE.MeshStandardMaterial;
    const key = materialKey(m);
    if (key === null || Array.isArray(o.material)) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    const center = geo.boundingBox!.getCenter(new THREE.Vector3());
    const bucket = `${Math.floor(center.x / CHUNK)},${Math.floor(center.z / CHUNK)}|${key}`;
    let b = buckets.get(bucket);
    if (!b) buckets.set(bucket, (b = { material: m, parts: [] }));
    b.parts.push(geo.index ? geo.toNonIndexed() : geo);
    doomed.push(o);
  });
  for (const mesh of doomed) mesh.removeFromParent();
  for (const { material, parts } of buckets.values()) {
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.merged = true;
    root.add(mesh);
  }
}

function buildFloor(level: Level): THREE.InstancedMesh {
  const w = BOUNDS.x1 - BOUNDS.x0;
  const d = BOUNDS.z1 - BOUNDS.z0;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.2, 0.98), new THREE.MeshStandardMaterial({ roughness: 0.85 }), w * d);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  let i = 0;
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const cx = BOUNDS.x0 + x + 0.5;
      const cz = BOUNDS.z0 + z + 0.5;
      const room = level.rooms.find((r) => r.id === roomAt(level, cx, cz));
      color.set(room?.floor ?? HALL_FLOOR);
      color.offsetHSL(0, 0, (x + z) % 2 ? 0.015 : -0.015);
      m.setPosition(cx, -0.1, cz);
      tiles.setMatrixAt(i, m);
      tiles.setColorAt(i, color);
      i++;
    }
  }
  tiles.receiveShadow = true;
  tiles.userData.noMerge = true;
  return tiles;
}

function buildWalls(level: Level): World["walls"] {
  const { walls } = level;
  const groups = { back: new THREE.Group(), interior: new THREE.Group(), front: new THREE.Group() };
  const parts: Record<keyof typeof groups, { upper: THREE.BufferGeometry[]; band: THREE.BufferGeometry[] }> = {
    back: { upper: [], band: [] }, interior: { upper: [], band: [] }, front: { upper: [], band: [] },
  };
  const seen = new Uint8Array(walls.solid.length);
  const solid = (c: number, r: number) => walls.inside(c, r) && walls.solid[walls.index(c, r)] === 1;
  const klass = (c: number, r: number): keyof typeof groups =>
    r === 0 || c === 0 ? "back" : r === walls.rows - 1 || c === walls.cols - 1 ? "front" : "interior";

  for (let r = 0; r < walls.rows; r++) {
    for (let c = 0; c < walls.cols; c++) {
      if (!solid(c, r) || seen[walls.index(c, r)]) continue;
      const k = klass(c, r);
      let c1 = c;
      while (solid(c1 + 1, r) && !seen[walls.index(c1 + 1, r)] && klass(c1 + 1, r) === k) c1++;
      let r1 = r;
      if (c1 === c) while (solid(c, r1 + 1) && !seen[walls.index(c, r1 + 1)] && klass(c, r1 + 1) === k) r1++;
      for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) seen[walls.index(cc, rr)] = 1;
      const w = (c1 - c + 1) * CELL;
      const d = (r1 - r + 1) * CELL;
      const x = walls.x0 + c * CELL + w / 2;
      const z = walls.z0 + r * CELL + d / 2;
      const upper = new THREE.BoxGeometry(w, WALL_HEIGHT, d).translate(x, WALL_HEIGHT / 2, z);
      const band = new THREE.BoxGeometry(w + 0.03, 1.1, d + 0.03).translate(x, 0.55, z);
      parts[k].upper.push(upper.toNonIndexed());
      parts[k].band.push(band.toNonIndexed());
    }
  }
  const upperMat = new THREE.MeshStandardMaterial({ color: "#d9d2b8", roughness: 0.95 });
  const bandMat = new THREE.MeshStandardMaterial({ color: "#a89b78", roughness: 0.95 });
  for (const k of Object.keys(groups) as (keyof typeof groups)[]) {
    for (const [list, material] of [[parts[k].upper, upperMat], [parts[k].band, bandMat]] as const) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.noMerge = true;
      groups[k].add(mesh);
    }
  }
  return groups;
}

export function buildWorld(level: Level): World {
  const root = new THREE.Group();
  root.add(buildFloor(level));
  const walls = buildWalls(level);
  root.add(walls.back, walls.interior, walls.front);

  const props = new THREE.Group();
  const deskProxies: THREE.Mesh[] = [];
  const screens = new Map<string, THREE.MeshStandardMaterial>();
  const puffAnchors: THREE.Vector3[] = [];

  for (const p of level.props) {
    const obj = makeProp(p);
    obj.position.set(p.x, p.kind === "clock" ? 2.75 : 0, p.z);
    obj.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
    props.add(obj);
    if (p.kind === "coffee") puffAnchors.push(new THREE.Vector3(p.x + 0.35, 1.25, p.z + 0.3));
    if (p.kind === "desk") {
      const seat = level.seats.find((s) => Math.hypot(s.x + Math.sin(s.face) * 0.95 - p.x, s.z + Math.cos(s.face) * 0.95 - p.z) < 0.3);
      if (seat) {
        obj.traverse((o) => {
          if (o.userData.isScreen) screens.set(seat.id, (o as THREE.Mesh).material as THREE.MeshStandardMaterial);
        });
        const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
        proxy.position.set(p.x, 0.7, p.z);
        proxy.userData.seatId = seat.id;
        proxy.userData.noMerge = true;
        deskProxies.push(proxy);
      }
    }
  }
  root.add(props);
  mergeStatic(props);
  for (const proxy of deskProxies) root.add(proxy);

  // Steam above every coffee machine
  const puffs: THREE.Mesh[] = [];
  for (const anchor of puffAnchors) {
    for (let n = 0; n < 5; n++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false }));
      puff.userData.noShadow = true;
      puff.userData.anchor = anchor;
      puff.userData.n = n;
      root.add(puff);
      puffs.push(puff);
    }
  }
  const steam = (time: number) => {
    for (const puff of puffs) {
      const a = puff.userData.anchor as THREE.Vector3;
      const n = puff.userData.n as number;
      const t = (time * 0.35 + n / 5) % 1;
      puff.position.set(a.x + Math.sin(time + n) * 0.03, a.y + t * 0.9, a.z + Math.cos(time * 0.8 + n) * 0.03);
      puff.scale.setScalar(0.6 + t * 1.6);
      (puff.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - t);
    }
  };

  return { root, walls, deskProxies, screens, steam };
}
