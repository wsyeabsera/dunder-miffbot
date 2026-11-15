// The building as data: rooms, doors, furniture and the places people go. One description feeds the 3D builder (build.ts),
// the walkable grid (grid.ts) and the activity system, so they cannot disagree. Pure: no three.js.
import { CELL, Grid, type Pt } from "./grid.ts";

export const BOUNDS = { x0: -30, z0: -20, x1: 30, z1: 20 };
export const WALL_HEIGHT = 3.6;

export type Rect = { x0: number; z0: number; x1: number; z1: number };
export type Door = { side: "N" | "S" | "E" | "W"; at: number; width: number };
export type Room = { id: string; name: string; rect: Rect; floor: string; doors: Door[] };

export type PropKind =
  | "desk" | "chair" | "couch" | "plant-tall" | "plant-fern" | "plant-succulent" | "cabinet" | "bookshelf" | "printer" | "cooler"
  | "coffee" | "bin" | "counter" | "fridge" | "vending" | "table" | "tv" | "pingpong" | "rack" | "bench" | "stall" | "sink"
  | "lamp" | "sidetable" | "rug" | "logo-rug" | "whiteboard" | "window" | "clock" | "poster" | "corkboard" | "sign" | "managerdesk";

/** Quarter turns about Y (0 faces +z, 1 faces +x, 2 faces -z, 3 faces -x). */
export type Quarter = 0 | 1 | 2 | 3;
export type Prop = { kind: PropKind; x: number; z: number; rot?: Quarter; w?: number; d?: number; text?: string; sub?: string; color?: string; border?: string };

export type Activity = "desk" | "coffee" | "lunch" | "print" | "restroom" | "couch" | "terrace" | "library" | "wander" | "chat" | "meeting";
export type Pose = "desk" | "stand" | "sip" | "sit" | "sitSoft";
/** A place one person uses at a time. `approach` is where the walk ends before stepping to the spot itself. */
export type Spot = { id: string; activity: Activity; x: number; z: number; face: number; pose: Pose; approach: Pt; room: string; reception?: boolean; /** The spot facing this one, for two people talking. */ partner?: string };

export type Level = { rooms: Room[]; props: Prop[]; spots: Spot[]; seats: Spot[]; walls: Grid; grid: Grid };

/** Footprints (width along the prop's own x, depth along its own z) of props people cannot walk through. */
const FOOT: Partial<Record<PropKind, [number, number]>> = {
  desk: [2.1, 1.1], managerdesk: [3, 1.5], couch: [2.6, 1.05], "plant-tall": [0.7, 0.7], "plant-fern": [0.7, 0.7], "plant-succulent": [0.4, 0.4],
  cabinet: [0.7, 0.7], bookshelf: [1.9, 0.5], printer: [1.3, 0.8], cooler: [0.5, 0.5], coffee: [1.2, 0.9], bin: [0.45, 0.45], counter: [3.6, 0.8],
  fridge: [0.9, 0.8], vending: [1.0, 0.9], table: [1.6, 1.6], tv: [2.2, 0.5], pingpong: [2.7, 1.5], rack: [0.8, 1.0], bench: [1.8, 0.7],
  stall: [1.1, 1.6], sink: [1.2, 0.6], lamp: [0.45, 0.45], sidetable: [0.7, 0.7],
};

export function footprint(p: Prop): Rect | null {
  const base = FOOT[p.kind];
  if (!base) return null;
  let [w, d] = [p.w ?? base[0], p.d ?? base[1]];
  if ((p.rot ?? 0) % 2 === 1) [w, d] = [d, w];
  return { x0: p.x - w / 2, z0: p.z - d / 2, x1: p.x + w / 2, z1: p.z + d / 2 };
}

const QUARTER_OF_FACE = (face: number): Quarter => (((Math.round(face / (Math.PI / 2)) % 4) + 4) % 4) as Quarter;
const dir = (face: number): Pt => ({ x: Math.sin(face), z: Math.cos(face) });
const at = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, z: p.z + d.z * k });

export function buildLevel(): Level {
  const { x0, z0, x1, z1 } = BOUNDS;
  const room = (id: string, name: string, rect: Rect, floor: string, doors: Door[] = []): Room => ({ id, name, rect, floor, doors });
  const R = (a: number, b: number, c: number, d: number): Rect => ({ x0: a, z0: b, x1: c, z1: d });
  const door = (side: Door["side"], atCoord: number, width = 2): Door => ({ side, at: atCoord, width });

  const rooms: Room[] = [
    room("kitchen", "Kitchen", R(-30, -20, -16, -8), "#d6c7a1", [door("S", -23)]),
    room("meetA", "Meeting room A", R(-16, -20, -6, -8), "#7a8499", [door("S", -11)]),
    room("meetB", "Meeting room B", R(-6, -20, 4, -8), "#7a8499", [door("S", -1)]),
    room("manager", "Manager's office", R(4, -20, 14, -8), "#a8764a", [door("S", 9)]),
    room("server", "Server room", R(14, -20, 22, -8), "#4a5060", [door("S", 18)]),
    room("print", "Print room", R(22, -20, 30, -8), "#a29b8a", [door("S", 26)]),
    room("lounge", "Lounge", R(16, -4, 30, 8), "#7a5a6a", [door("W", 2, 3), door("S", 23, 2.5)]),
    room("terrace", "Terrace", R(16, 8, 30, 20), "#b5895a"),
    room("restW", "Restroom", R(-30, 8, -22, 20), "#c8d4d8", [door("N", -26)]),
    room("restM", "Restroom", R(-22, 8, -14, 20), "#c8d4d8", [door("N", -18)]),
    room("supply", "Supply closet", R(-14, 8, -8, 20), "#a29b8a", [door("N", -11)]),
    room("lobby", "Lobby", R(-8, 8, 8, 20), "#9b7b57", [door("N", 0, 4), door("S", 0, 3)]),
    room("library", "Library", R(8, 8, 16, 20), "#7a6a52", [door("N", 12)]),
  ];

  const props: Prop[] = [];
  const spots: Spot[] = [];
  const seats: Spot[] = [];
  const add = (p: Prop) => props.push(p);
  let n = 0;
  const spot = (activity: Activity, room: string, x: number, z: number, face: number, pose: Pose, approach?: Pt, extra: Partial<Spot> = {}): Spot => {
    const s: Spot = { id: `${room}:${activity}:${n++}`, activity, room, x, z, face, pose, approach: approach ?? { x, z }, ...extra };
    spots.push(s);
    return s;
  };
  /** A seat with its chair. Behind-the-chair approach, because a desk or table is in front. */
  const chairSpot = (activity: Activity, room: string, x: number, z: number, face: number, pose: Pose, extra: Partial<Spot> = {}) => {
    add({ kind: "chair", x, z, rot: QUARTER_OF_FACE(face) });
    return spot(activity, room, x, z, face, pose, at({ x, z }, dir(face), -1.1), extra);
  };

  // ---- Open-plan floor: islands of back-to-back desks, two rows
  for (const zc of [-1.8, 4.2]) {
    for (let col = 0; col < 8; col++) {
      const x = -26 + col * 4;
      add({ kind: "desk", x, z: zc - 0.6, rot: 2 }); // worker on the north side, facing +z
      const north = chairSpot("desk", "hall", x, zc - 0.6 - 0.95, 0, "desk");
      add({ kind: "desk", x, z: zc + 0.6, rot: 0 }); // worker on the south side, facing -z
      const south = chairSpot("desk", "hall", x, zc + 0.6 + 0.95, Math.PI, "desk");
      seats.push(north, south);
    }
  }
  // Remove the desk seats from the general spot list; they are assigned by name, not chosen at random.
  for (const s of seats) spots.splice(spots.indexOf(s), 1);

  // ---- Hall details: windows and sign on the west wall, plants, coolers, a meeting corner
  for (const z of [-4.5, 4.5]) add({ kind: "window", x: x0 + CELL, z, rot: 1 });
  add({ kind: "sign", x: x0 + CELL, z: 0, rot: 1, text: "DUNDER MIFFBOT" });
  add({ kind: "clock", x: x0 + CELL, z: -7, rot: 1 });
  add({ kind: "cooler", x: x0 + 1, z: -6.5, rot: 1 });
  add({ kind: "plant-tall", x: x0 + 1, z: -7.2 });
  add({ kind: "plant-tall", x: x0 + 1, z: 7.2 });
  add({ kind: "cabinet", x: x0 + 1, z: 7.2 - 1.2 });
  add({ kind: "rug", x: 10, z: 0, w: 9, d: 6, color: "#2f5d62", border: "#e8e2d0" });
  for (const [px, pz] of [[7, -6], [13, -6], [7, 6], [13, 6]] as const) add({ kind: "plant-tall", x: px, z: pz });
  // Standing spots in the town square: two people can meet at a pair of chat spots, facing each other
  spot("wander", "hall", 12, 4.5, Math.PI / 2, "stand");
  spot("wander", "hall", 12, -4.5, Math.PI / 2, "stand");
  for (const [cx, cz] of [[8.4, -3.5], [8.4, 3.5], [11.6, -0.5]] as const) {
    const a = spot("chat", "hall", cx, cz, Math.PI / 2, "stand");
    const b = spot("chat", "hall", cx + 1.5, cz, -Math.PI / 2, "stand");
    a.partner = b.id;
    b.partner = a.id;
  }

  // ---- Kitchen
  add({ kind: "window", x: -25, z: z0 + CELL });
  add({ kind: "corkboard", x: -19.5, z: z0 + CELL });
  add({ kind: "coffee", x: -28.5, z: -19.05 });
  add({ kind: "fridge", x: -26.2, z: -19.1 });
  add({ kind: "counter", x: -22.6, z: -19.1 });
  add({ kind: "vending", x: -18.6, z: -19.05 });
  add({ kind: "bin", x: -29.2, z: -9 });
  for (const qz of [-17.7, -16.9, -16.1]) spot("coffee", "kitchen", -28.5, qz, Math.PI, "sip");
  // Two columns of tables; the chair between the two rows is left out so every chair can be walked up to.
  for (const [tx, tz, outer] of [[-25, -14, -1], [-19, -14, -1], [-25, -11, 1], [-19, -11, 1]] as const) {
    add({ kind: "table", x: tx, z: tz });
    chairSpot("lunch", "kitchen", tx - 1.25, tz, Math.PI / 2, "sit");
    chairSpot("lunch", "kitchen", tx + 1.25, tz, -Math.PI / 2, "sit");
    chairSpot("lunch", "kitchen", tx, tz + outer * 1.25, outer < 0 ? 0 : Math.PI, "sit");
  }

  // ---- Meeting rooms (furnished for later meetings)
  for (const [room, cx] of [["meetA", -11], ["meetB", -1]] as const) {
    add({ kind: "table", x: cx, z: -14, w: 4.8, d: 1.7 });
    for (const dx of [-1.5, -0.5, 0.5, 1.5]) {
      chairSpot("meeting", room, cx + dx, -14 - 1.3, 0, "sit");
      chairSpot("meeting", room, cx + dx, -14 + 1.3, Math.PI, "sit");
    }
    add({ kind: "whiteboard", x: cx, z: z0 + CELL });
    add({ kind: "plant-fern", x: cx - 4, z: -9.2 });
  }

  // ---- Manager's office
  add({ kind: "managerdesk", x: 9, z: -16, rot: 0 });
  add({ kind: "chair", x: 9, z: -17.3, rot: 0 });
  add({ kind: "chair", x: 7.6, z: -13.6, rot: 2 });
  add({ kind: "chair", x: 10.4, z: -13.6, rot: 2 });
  add({ kind: "bookshelf", x: 5.6, z: -19.2 });
  add({ kind: "bookshelf", x: 12.4, z: -19.2 });
  add({ kind: "window", x: 9, z: z0 + CELL });
  add({ kind: "poster", x: 6.2, z: z0 + CELL, text: "WORLD'S BEST", sub: "BOSS (self-awarded)", color: "#b8862f" });
  add({ kind: "plant-tall", x: 13.2, z: -9.2 });
  add({ kind: "rug", x: 9, z: -13.5, w: 5, d: 3.4, color: "#6b3f4f", border: "#e8b04a" });

  // ---- Server room
  for (const rz of [-17.5, -14.5]) for (const rx of [15.6, 17, 18.4, 19.8, 21.2]) add({ kind: "rack", x: rx, z: rz, rot: 0 });

  // ---- Print room
  for (const px of [24.5, 27.8]) {
    add({ kind: "printer", x: px, z: -19.1 });
    spot("print", "print", px, -17.7, Math.PI, "stand");
  }
  add({ kind: "cabinet", x: 29.1, z: -14.5, rot: 3 });
  add({ kind: "cabinet", x: 29.1, z: -13.5, rot: 3 });
  add({ kind: "bookshelf", x: 22.8, z: -13, rot: 1 });
  add({ kind: "bin", x: 23.1, z: -9.2 });
  add({ kind: "poster", x: 26, z: z0 + CELL, text: "PLEASE DON'T", sub: "print this email", color: "#2f7d8a" });

  // ---- Lounge: TV, two couches facing it, a ping-pong table, plants
  add({ kind: "tv", x: 23, z: -3.15 });
  for (const cx of [20.5, 25.5]) {
    add({ kind: "couch", x: cx, z: 1.6, rot: 2 });
    for (const dx of [-0.85, 0, 0.85]) spot("couch", "lounge", cx + dx, 1.6, Math.PI, "sitSoft", { x: cx + dx, z: 1.6 - 1.4 });
  }
  add({ kind: "pingpong", x: 26, z: 5.2, rot: 0 });
  add({ kind: "rug", x: 23, z: 0, w: 11, d: 5.4, color: "#4a3a5a", border: "#e8b04a" });
  add({ kind: "lamp", x: 17.3, z: -2.8 });
  add({ kind: "plant-tall", x: 29.2, z: -2.8 });
  add({ kind: "sidetable", x: 17.4, z: 6.8 });
  add({ kind: "plant-fern", x: 29.1, z: 7 });

  // ---- Terrace
  for (const bx of [20, 26]) {
    add({ kind: "bench", x: bx, z: 14.5, rot: 0 });
    for (const dx of [-0.4, 0.4]) spot("terrace", "terrace", bx + dx, 14.5, 0, "sitSoft", { x: bx + dx, z: 14.5 + 1.4 });
  }
  for (const [px, pz] of [[17.2, 9.3], [29, 9.3], [17.2, 19], [29, 19]] as const) add({ kind: "plant-tall", x: px, z: pz });
  add({ kind: "table", x: 23, z: 17.5 });
  add({ kind: "lamp", x: 20, z: 11 });
  add({ kind: "lamp", x: 26, z: 11 });

  // ---- Restrooms
  for (const [id, rx] of [["restW", -26], ["restM", -18]] as const) {
    for (const dx of [-2.5, 0, 2.5]) add({ kind: "stall", x: rx + dx, z: 18.4, rot: 0 });
    add({ kind: "sink", x: rx - 2.5, z: 9.1 });
    add({ kind: "sink", x: rx + 2.5, z: 9.1 });
    spot("restroom", id, rx, 13.5, 0, "stand");
  }

  // ---- Supply closet
  for (const sx of [-12.4, -9.4]) add({ kind: "bookshelf", x: sx, z: 19.0, rot: 2 });
  add({ kind: "cabinet", x: -13.1, z: 12 });
  add({ kind: "cabinet", x: -13.1, z: 13 });
  add({ kind: "bin", x: -8.9, z: 10 });

  // ---- Lobby: reception desk with the receptionist behind it, a waiting corner, a logo rug
  add({ kind: "logo-rug", x: -1.5, z: 13.5, w: 7, d: 3.6, text: "DUNDER MIFFBOT", color: "#1f2633", border: "#7aa2ff" });
  add({ kind: "desk", x: 3.8, z: 15.2, rot: 2 });
  seats.push(chairSpot("desk", "lobby", 3.8, 15.2 - 0.95, 0, "desk", { reception: true }));
  spots.splice(spots.length - 1, 1);
  add({ kind: "couch", x: -6, z: 17, rot: 1 });
  add({ kind: "sidetable", x: -6.9, z: 15.2 });
  add({ kind: "lamp", x: -7, z: 19 });
  add({ kind: "plant-tall", x: 7, z: 19 });
  add({ kind: "plant-tall", x: -7, z: 9.5 });
  add({ kind: "plant-fern", x: 7, z: 9.5 });

  // ---- Library
  for (const bx of [10, 14]) {
    add({ kind: "bookshelf", x: bx, z: 12 });
    spot("library", "library", bx, 13.3, Math.PI, "stand");
  }
  add({ kind: "bookshelf", x: 12, z: 19.0, rot: 2 });
  add({ kind: "plant-fern", x: 9, z: 9.5 });
  add({ kind: "rug", x: 12, z: 16, w: 5, d: 3, color: "#5a4a6e", border: "#e8e2d0" });

  // ---- Grids: walls, then furniture on top
  const gx = x1 - x0 + CELL;
  const gz = z1 - z0 + CELL;
  const walls = new Grid(x0, z0, gx, gz);
  const edge = (r: Rect) => {
    walls.setRect(r.x0, r.z0, r.x1 + CELL, r.z0 + CELL, 1);
    walls.setRect(r.x0, r.z1, r.x1 + CELL, r.z1 + CELL, 1);
    walls.setRect(r.x0, r.z0, r.x0 + CELL, r.z1 + CELL, 1);
    walls.setRect(r.x1, r.z0, r.x1 + CELL, r.z1 + CELL, 1);
  };
  edge(BOUNDS);
  for (const r of rooms) edge(r.rect);
  for (const r of rooms) {
    for (const d of r.doors) {
      const h = d.width / 2;
      const { x0: a, z0: b, x1: c, z1: e } = r.rect;
      if (d.side === "N") walls.setRect(d.at - h, b, d.at + h, b + CELL, 0);
      if (d.side === "S") walls.setRect(d.at - h, e, d.at + h, e + CELL, 0);
      if (d.side === "W") walls.setRect(a, d.at - h, a + CELL, d.at + h, 0);
      if (d.side === "E") walls.setRect(c, d.at - h, c + CELL, d.at + h, 0);
    }
  }
  const grid = new Grid(x0, z0, gx, gz);
  grid.solid.set(walls.solid);
  for (const p of props) {
    const f = footprint(p);
    if (f) grid.setRect(f.x0, f.z0, f.x1, f.z1, 1);
  }

  return { rooms, props, spots, seats, walls, grid };
}

/** The room a point is in, or "hall". */
export function roomAt(level: Level, x: number, z: number): string {
  for (const r of level.rooms) if (x >= r.rect.x0 && x < r.rect.x1 && z >= r.rect.z0 && z < r.rect.z1) return r.id;
  return "hall";
}
