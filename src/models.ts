// Models built from Three.js primitives: no external files, no textures (a few canvas drawings aside).
import * as THREE from "three";
import type { Look } from "./state.ts";

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

const glow = (color: string, intensity = 1) => mat(color, { emissive: new THREE.Color(color), emissiveIntensity: intensity });

/** Adds a child and returns the child (Object3D.add returns the parent, which made chained tweaks hit the wrong object). */
function put<T extends THREE.Object3D>(parent: THREE.Object3D, child: T): T {
  parent.add(child);
  return child;
}

function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat(color));
  m.position.set(x, y, z);
  return m;
}

function ball(r: number, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

function capsule(r: number, len: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat(color));
  m.position.set(x, y, z);
  return m;
}

// ---------------------------------------------------------------- people

export type Character = {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  eyes: THREE.Mesh[];
};

function makeHair(style: Look["hairStyle"], color: string): THREE.Group {
  const g = new THREE.Group();
  if (style === "bald") return g;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.295, 20, 14, 0, Math.PI * 2, 0, Math.PI * (style === "short" ? 0.5 : style === "bob" ? 0.46 : 0.52)), mat(color));
  cap.position.set(0, 0.24, -0.015);
  cap.rotation.x = -0.18;
  g.add(cap);
  if (style === "short") {
    for (const x of [-1, 1]) g.add(ball(0.08, color, x * 0.26, 0.2, -0.02, 0.7, 1.4, 1.2)); // sideburns
  } else if (style === "bob") {
    for (const x of [-1, 1]) g.add(capsule(0.1, 0.22, color, x * 0.25, 0.1, -0.02));
    g.add(ball(0.28, color, 0, 0.14, -0.1, 1, 1.05, 0.8));
  } else if (style === "bun") {
    g.add(ball(0.13, color, 0, 0.55, -0.15));
    g.add(ball(0.2, color, 0, 0.2, -0.17, 1, 1, 0.8));
  } else if (style === "curly") {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(ball(0.1, color, Math.cos(a) * 0.25, 0.3 + (i % 3) * 0.08, Math.sin(a) * 0.23 - 0.03));
    }
    g.add(ball(0.12, color, 0, 0.55, 0));
  }
  return g;
}

/** Origin at the feet. Faces +z. Joints hang from pivot groups so they can swing and bend. */
export function makeCharacter(look: Look): Character {
  const group = new THREE.Group();
  group.scale.set(look.build * look.height, look.height, look.build * look.height);
  const body = new THREE.Group();
  group.add(body);

  // Legs and shoes
  const leg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.86, 0);
    pivot.add(capsule(0.12, 0.5, look.pants, 0, -0.4, 0));
    pivot.add(box(0.26, 0.13, 0.42, look.shoes, 0, -0.78, 0.07));
    body.add(pivot);
    return pivot;
  };
  const leftLeg = leg(-0.17);
  const rightLeg = leg(0.17);

  // Hips, belt, torso
  body.add(box(0.5, 0.2, 0.32, look.pants, 0, 0.92, 0));
  body.add(box(0.53, 0.045, 0.34, "#2a2230", 0, 1.0, 0));
  const torso = capsule(0.3, 0.32, look.shirt, 0, 1.3, 0);
  torso.scale.set(1, 1, 0.68);
  body.add(torso);
  for (const x of [-1, 1]) body.add(ball(0.13, look.shirt, x * 0.36, 1.52));
  body.add(box(0.26, 0.05, 0.2, "#f4f4f6", 0, 1.58, 0.09)); // collar
  if (look.accessory === "tie") {
    body.add(box(0.07, 0.05, 0.03, "#2a2a3a", 0, 1.54, 0.2));
    const tie = box(0.09, 0.42, 0.025, "#2a2a3a", 0, 1.3, 0.205);
    tie.scale.x = 0.9;
    body.add(tie);
  } else if (look.accessory === "lanyard") {
    put(body, box(0.03, 0.4, 0.02, "#e0556b", -0.07, 1.4, 0.2)).rotation.z = -0.12;
    put(body, box(0.03, 0.4, 0.02, "#e0556b", 0.07, 1.4, 0.2)).rotation.z = 0.12;
    body.add(box(0.13, 0.17, 0.02, "#ffffff", 0, 1.13, 0.21));
  } else if (look.accessory === "cardigan") {
    for (const x of [-1, 1]) {
      const panel = box(0.2, 0.62, 0.05, "#7a7f8a", x * 0.2, 1.28, 0.2);
      body.add(panel);
    }
  }

  // Neck and head
  body.add(cyl(0.085, 0.095, 0.14, look.skin, 0, 1.62, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  const skull = ball(0.27, look.skin, 0, 0.22, 0, 1, 1.07, 0.96);
  head.add(skull);
  head.add(makeHair(look.hairStyle, look.hair));
  for (const x of [-1, 1]) head.add(ball(0.055, look.skin, x * 0.265, 0.2, 0, 0.6, 1, 1));
  head.add(ball(0.04, look.skin, 0, 0.19, 0.265, 1, 1, 1.2)); // nose

  const eyes: THREE.Mesh[] = [];
  for (const x of [-1, 1]) {
    const eye = ball(0.052, "#ffffff", x * 0.1, 0.26, 0.23, 1, 1.1, 0.5);
    eye.add(ball(0.027, "#1a1a22", 0, 0, 0.04, 1, 1, 0.5));
    head.add(eye);
    eyes.push(eye);
    const brow = box(0.1, 0.022, 0.03, look.hair === "#ffffff" ? "#999999" : look.hair, x * 0.1, 0.34, 0.235);
    brow.rotation.z = x * -0.12;
    head.add(brow);
  }
  head.add(box(0.1, 0.02, 0.03, "#8a3f45", 0, 0.1, 0.245)); // mouth
  if (look.accessory === "glasses") {
    for (const x of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.009, 8, 20), mat("#c9a14a", { metalness: 0.5, roughness: 0.4 }));
      ring.position.set(x * 0.1, 0.26, 0.265);
      head.add(ring);
    }
    head.add(box(0.05, 0.01, 0.01, "#c9a14a", 0, 0.27, 0.27));
  } else if (look.accessory === "mustache") {
    head.add(ball(0.05, "#4a3a30", -0.04, 0.14, 0.25, 1.4, 0.5, 0.6));
    head.add(ball(0.05, "#4a3a30", 0.04, 0.14, 0.25, 1.4, 0.5, 0.6));
  }
  body.add(head);

  // Arms: shoulder pivot, elbow pivot, hand
  const arm = (x: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 1.52, 0);
    shoulder.add(capsule(0.085, 0.26, look.shirt, 0, -0.22, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.44, 0);
    elbow.add(capsule(0.072, 0.24, look.skin, 0, -0.17, 0));
    elbow.add(ball(0.085, look.skin, 0, -0.34, 0.01));
    shoulder.add(elbow);
    body.add(shoulder);
    return { shoulder, elbow };
  };
  const l = arm(-0.42);
  const r = arm(0.42);

  return { group, body, head, leftArm: l.shoulder, rightArm: r.shoulder, leftForearm: l.elbow, rightForearm: r.elbow, leftLeg, rightLeg, eyes };
}

// ---------------------------------------------------------------- desk and chair

/** Desk with monitor, keyboard, mug, lamp and papers. Origin on the floor at the desk centre; the screen faces +z, where the worker sits. */
export function makeDesk(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.1, 0.1, 1.1, "#c9954f", 0, 1.0, 0));
  g.add(box(2.14, 0.03, 1.14, "#a87a3a", 0, 0.945, 0));
  for (const x of [-0.95, 0.95]) for (const z of [-0.45, 0.45]) g.add(box(0.08, 0.95, 0.08, "#7a5528", x, 0.475, z));
  // Drawer pedestal
  g.add(box(0.5, 0.7, 0.9, "#b48243", 0.7, 0.55, 0));
  for (const y of [0.32, 0.55, 0.78]) {
    g.add(box(0.46, 0.2, 0.02, "#a37337", 0.7, y, 0.46));
    g.add(box(0.14, 0.025, 0.03, "#d8dde6", 0.7, y, 0.48));
  }
  // Monitor
  g.add(box(0.5, 0.03, 0.3, "#2b3445", 0, 1.065, -0.22));
  g.add(box(0.08, 0.3, 0.05, "#2b3445", 0, 1.2, -0.25));
  const frame = box(0.95, 0.56, 0.05, "#1f2633", 0, 1.55, -0.25);
  frame.userData.isMonitor = true;
  g.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.47), glow("#6fb9ff", 0.9));
  screen.position.set(0, 1.55, -0.222);
  screen.userData.isScreen = true;
  g.add(screen);
  for (let i = 0; i < 4; i++) g.add(box(0.1 + i * 0.1, 0.025, 0.004, "#dff0ff", -0.3 + (0.1 + i * 0.1) / 2, 1.72 - i * 0.07, -0.219));
  // Keyboard and mouse
  g.add(box(0.55, 0.025, 0.18, "#cfd5df", -0.1, 1.062, 0.18));
  g.add(box(0.07, 0.03, 0.11, "#cfd5df", 0.38, 1.064, 0.18));
  // Mug
  const mug = cyl(0.07, 0.065, 0.13, "#f4f4f6", 0.6, 1.115, -0.25, 14);
  g.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 12, Math.PI), mat("#f4f4f6"));
  handle.position.set(0.67, 1.115, -0.25);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  g.add(cyl(0.06, 0.06, 0.01, "#5a3a22", 0.6, 1.178, -0.25, 14));
  // Papers and lamp
  const papers = box(0.3, 0.04, 0.4, "#f4f4ee", -0.75, 1.07, 0.1);
  papers.rotation.y = 0.2;
  g.add(papers);
  const papers2 = box(0.28, 0.02, 0.36, "#e8e2d0", -0.72, 1.1, 0.08);
  papers2.rotation.y = -0.1;
  g.add(papers2);
  g.add(cyl(0.1, 0.12, 0.03, "#2b3445", -0.8, 1.065, -0.3));
  const arm = box(0.03, 0.45, 0.03, "#2b3445", -0.8, 1.3, -0.3);
  arm.rotation.z = 0.25;
  g.add(arm);
  const shade = cyl(0.04, 0.12, 0.12, "#ffd166", -0.7, 1.53, -0.3);
  shade.rotation.z = 0.25;
  g.add(shade);
  return g;
}

export function makeChair(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.66, 0.1, 0.62, "#3d4660", 0, 0.72, 0));
  put(g, box(0.62, 0.62, 0.09, "#3d4660", 0, 1.08, -0.3)).rotation.x = -0.08;
  g.add(cyl(0.05, 0.05, 0.4, "#222833", 0, 0.45, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = box(0.3, 0.04, 0.05, "#222833", Math.cos(a) * 0.15, 0.15, Math.sin(a) * 0.15);
    spoke.rotation.y = -a;
    g.add(spoke);
    g.add(ball(0.045, "#14181f", Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3));
  }
  for (const x of [-1, 1]) {
    g.add(box(0.05, 0.03, 0.4, "#222833", x * 0.36, 0.95, -0.02));
    g.add(box(0.04, 0.2, 0.04, "#222833", x * 0.36, 0.84, 0.1));
  }
  return g;
}

// ---------------------------------------------------------------- props

/** A hand-held mug, handle towards +x. Origin at its base centre. */
export function makeMug(color = "#f4f4f6"): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.065, 0.13, color, 0, 0.065, 0, 14));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 12, Math.PI), mat(color));
  handle.position.set(0.07, 0.07, 0);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  g.add(cyl(0.06, 0.06, 0.01, "#5a3a22", 0, 0.128, 0, 14));
  return g;
}

export function makeCoffeeMachine(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.2, 1.0, 0.9, "#8a6a4a", 0, 0.5, 0));
  g.add(box(1.1, 0.04, 0.8, "#aa8a6a", 0, 1.02, 0));
  g.add(box(0.8, 0.8, 0.6, "#4a4f5c", 0, 1.45, -0.05));
  g.add(box(0.5, 0.18, 0.04, "#14161c", 0, 1.65, 0.26));
  put(g, box(0.14, 0.05, 0.02, "#7ec8ff", -0.12, 1.65, 0.285)).material = glow("#7ec8ff", 1);
  g.add(box(0.2, 0.1, 0.1, "#9aa3b2", 0, 1.3, 0.3));
  g.add(cyl(0.07, 0.06, 0.12, "#f4f4f6", 0, 1.12, 0.3, 12));
  const light = box(0.08, 0.08, 0.04, "#ff5544", 0.28, 1.65, 0.285);
  light.material = glow("#ff3322", 1.2);
  g.add(light);
  for (const x of [-0.4, -0.25]) g.add(cyl(0.05, 0.045, 0.1, x < -0.3 ? "#e0556b" : "#4aa3df", x, 1.09, 0.2, 10));
  return g;
}

export function makePlant(kind: "fern" | "tall" | "succulent" = "fern"): THREE.Group {
  const g = new THREE.Group();
  const pot = cyl(0.36, 0.28, 0.5, kind === "tall" ? "#e8e2d0" : "#a8613a", 0, 0.25, 0);
  g.add(pot);
  g.add(cyl(0.34, 0.34, 0.03, "#3a2a1a", 0, 0.5, 0));
  if (kind === "tall") {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const leaf = ball(0.22, i % 2 ? "#3f9b4a" : "#2f7d3a", Math.cos(a) * 0.22, 0.9 + i * 0.16, Math.sin(a) * 0.22, 1, 1.5, 0.6);
      leaf.rotation.y = a;
      g.add(leaf);
    }
    g.add(cyl(0.04, 0.05, 1.3, "#6b4a2a", 0, 1.1, 0, 8));
  } else if (kind === "succulent") {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = ball(0.1, "#58b36c", Math.cos(a) * 0.14, 0.62, Math.sin(a) * 0.14, 0.6, 1.8, 0.6);
      leaf.rotation.z = Math.cos(a) * 0.5;
      leaf.rotation.x = Math.sin(a) * 0.5;
      g.add(leaf);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const leaf = ball(0.28, i % 2 ? "#3f9b4a" : "#2f7d3a", Math.cos(i * 1.3) * 0.22, 0.85 + i * 0.1, Math.sin(i * 1.3) * 0.22);
      g.add(leaf);
    }
  }
  return g;
}

export function makeCouch(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.6, 0.35, 1.05, "#8a4f6a", 0, 0.3, 0));
  g.add(box(2.6, 0.85, 0.28, "#74405a", 0, 0.78, -0.4));
  for (const x of [-1.25, 1.25]) g.add(box(0.22, 0.65, 1.05, "#74405a", x, 0.5, 0));
  for (const x of [-0.6, 0.6]) g.add(box(1.1, 0.16, 0.8, "#9a5a78", x, 0.55, 0.05));
  const cushion = box(0.4, 0.4, 0.14, "#e8b04a", -0.95, 0.85, -0.2);
  cushion.rotation.z = 0.25;
  cushion.rotation.y = 0.2;
  g.add(cushion);
  const cushion2 = box(0.38, 0.38, 0.14, "#4aa3a0", 0.95, 0.85, -0.2);
  cushion2.rotation.z = -0.2;
  g.add(cushion2);
  for (const x of [-1.15, 1.15]) for (const z of [-0.4, 0.4]) g.add(box(0.1, 0.12, 0.1, "#2a1a22", x, 0.06, z));
  return g;
}

/** Sets the largest bold font that fits `maxWidth` pixels, starting from `size`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, weight = "bold") {
  let px = size;
  do ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && (px -= 2) > 8);
}

/** A canvas drawing as a flat panel, used for the whiteboard, posters and signs. */
function drawn(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, pxPerUnit = 300): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = Math.round(width * pxPerUnit);
  c.height = Math.round(height * pxPerUnit);
  draw(c.getContext("2d")!, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
}

export function makeWhiteboard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.2, 1.7, 0.06, "#9aa3b2", 0, 2.1, 0));
  const face = drawn(3, 1.5, (ctx, w, h) => {
    ctx.fillStyle = "#f5f7fa";
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    const line = (color: string, pts: number[][]) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.stroke();
    };
    ctx.fillStyle = "#e0556b";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText("Q4 GOALS", 0.06 * w, 0.2 * h);
    line("#4aa3df", [[0.06, 0.32], [0.5, 0.32]]);
    line("#3f9b4a", [[0.06, 0.45], [0.62, 0.45]]);
    line("#4aa3df", [[0.06, 0.58], [0.4, 0.58]]);
    line("#e0556b", [[0.55, 0.9], [0.65, 0.65], [0.75, 0.8], [0.85, 0.5], [0.94, 0.62]]);
    line("#222222", [[0.06, 0.82], [0.3, 0.82]]);
  });
  face.position.set(0, 2.1, 0.035);
  g.add(face);
  g.add(box(2.6, 0.05, 0.1, "#9aa3b2", 0, 1.22, 0.06));
  for (const [x, c] of [[-0.5, "#e0556b"], [-0.3, "#4aa3df"], [-0.1, "#222222"]] as const) g.add(box(0.14, 0.04, 0.04, c, x, 1.27, 0.08));
  return g;
}

export function makeWindow(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.6, 1.9, 0.12, "#e8ecf4", 0, 2.1, 0));
  const sky = drawn(2.3, 1.6, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#7fb8ff");
    grad.addColorStop(1, "#d6ecff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const [x, y, r] of [[0.25, 0.3, 0.1], [0.34, 0.27, 0.13], [0.7, 0.45, 0.09], [0.78, 0.42, 0.12]]) {
      ctx.beginPath();
      ctx.arc(x * w, y * h, r * h, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#6b8fb8";
    for (const [x, hh, ww] of [[0.1, 0.25, 0.12], [0.28, 0.35, 0.1], [0.48, 0.2, 0.14], [0.68, 0.3, 0.1], [0.85, 0.22, 0.13]]) ctx.fillRect(x * w, h - hh * h, ww * w, hh * h);
  });
  sky.position.set(0, 2.1, 0.07);
  (sky.material as THREE.MeshStandardMaterial).emissive = new THREE.Color("#bfe0ff");
  (sky.material as THREE.MeshStandardMaterial).emissiveMap = (sky.material as THREE.MeshStandardMaterial).map;
  (sky.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
  g.add(sky);
  g.add(box(0.07, 1.6, 0.06, "#e8ecf4", 0, 2.1, 0.09));
  g.add(box(2.3, 0.07, 0.06, "#e8ecf4", 0, 2.1, 0.09));
  g.add(box(2.8, 0.08, 0.3, "#e8ecf4", 0, 1.12, 0.1));
  for (let i = 0; i < 6; i++) g.add(box(2.3, 0.05, 0.03, "#d4d9e4", 0, 2.85 - i * 0.07, 0.1));
  return g;
}

export function makeClock(): THREE.Group {
  const g = new THREE.Group();
  const face = cyl(0.4, 0.4, 0.06, "#f4f4f6", 0, 0, 0, 28);
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 28), mat("#2a2a3a"));
  g.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    put(g, box(0.03, i % 3 === 0 ? 0.08 : 0.04, 0.02, "#2a2a3a", Math.sin(a) * 0.32, Math.cos(a) * 0.32, 0.04)).rotation.z = -a;
  }
  const hour = box(0.035, 0.2, 0.02, "#2a2a3a", 0, 0.08, 0.05);
  hour.rotation.z = -0.9;
  const minute = box(0.025, 0.3, 0.02, "#2a2a3a", 0, 0.12, 0.06);
  minute.rotation.z = 0.5;
  g.add(hour, minute);
  return g;
}

export function makeBookshelf(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.9, 2.3, 0.5, "#8a6230", 0, 1.15, 0));
  const colors = ["#e0556b", "#4aa3df", "#3f9b4a", "#e8b04a", "#7a5aa8", "#e8e2d0", "#2f7d8a"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.28 + shelf * 0.55;
    g.add(box(1.8, 0.04, 0.48, "#a87a3a", 0, y - 0.02, 0.01));
    let x = -0.82;
    while (x < 0.78) {
      const w = 0.07 + rnd() * 0.08;
      const h = 0.34 + rnd() * 0.14;
      const book = box(w, h, 0.3, colors[Math.floor(rnd() * colors.length)], x + w / 2, y + h / 2, 0.08);
      book.rotation.z = rnd() < 0.08 ? 0.25 : 0;
      g.add(book);
      x += w + 0.01;
    }
  }
  return g;
}

export function makeFilingCabinet(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 1.4, 0.7, "#9aa3b2", 0, 0.7, 0));
  for (const y of [0.3, 0.7, 1.1]) {
    g.add(box(0.62, 0.34, 0.02, "#aab2c0", 0, y, 0.36));
    g.add(box(0.2, 0.03, 0.03, "#3a4152", 0, y + 0.08, 0.38));
  }
  return g;
}

export function makePrinter(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.3, 0.8, 0.8, "#8a6230", 0, 0.4, 0));
  g.add(box(1.0, 0.4, 0.6, "#dfe3ea", 0, 1.0, 0));
  g.add(box(0.9, 0.06, 0.4, "#2a2a30", 0, 1.22, 0));
  put(g, box(0.7, 0.03, 0.4, "#ffffff", 0, 1.08, 0.5)).rotation.x = 0.2;
  put(g, box(0.12, 0.04, 0.02, "#e0556b", 0.35, 1.1, 0.31)).material = glow("#ff5544", 1);
  return g;
}

export function makeWaterCooler(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.5, 1.0, 0.5, "#e8ecf4", 0, 0.5, 0));
  g.add(box(0.1, 0.06, 0.1, "#4aa3df", -0.1, 0.8, 0.27));
  g.add(box(0.1, 0.06, 0.1, "#e0556b", 0.1, 0.8, 0.27));
  const jug = cyl(0.2, 0.22, 0.55, "#9fd4ff", 0, 1.3, 0, 18);
  (jug.material as THREE.MeshStandardMaterial).transparent = true;
  (jug.material as THREE.MeshStandardMaterial).opacity = 0.7;
  g.add(jug);
  g.add(cyl(0.1, 0.2, 0.12, "#9fd4ff", 0, 1.64, 0));
  return g;
}

export function makeBin(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.17, 0.5, "#4a5468", 0, 0.25, 0, 14));
  const balled = ball(0.1, "#f4f4ee", 0.05, 0.55, 0.03);
  g.add(balled);
  return g;
}

export function makeFloorLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.22, 0.05, "#2a2a3a", 0, 0.03, 0));
  g.add(cyl(0.025, 0.025, 1.7, "#2a2a3a", 0, 0.9, 0, 8));
  g.add(cyl(0.2, 0.32, 0.4, "#ffe2a8", 0, 1.8, 0, 16));
  (g.children[g.children.length - 1] as THREE.Mesh).material = glow("#ffd68a", 0.8);
  return g;
}

export function makeSideTable(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.35, 0.35, 0.05, "#c9954f", 0, 0.65, 0, 20));
  g.add(cyl(0.04, 0.04, 0.62, "#7a5528", 0, 0.33, 0, 8));
  g.add(cyl(0.22, 0.22, 0.04, "#7a5528", 0, 0.02, 0, 16));
  const plant = makePlant("succulent");
  plant.scale.setScalar(0.6);
  plant.position.y = 0.67;
  g.add(plant);
  return g;
}

export function makeRug(width: number, depth: number, color: string, border: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(width, 0.03, depth, border, 0, 0.015, 0));
  g.add(box(width - 0.3, 0.04, depth - 0.3, color, 0, 0.02, 0));
  return g;
}

/** Wall art: a framed picture, a corkboard with notes, or the company sign. */
export function makeCorkboard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 1.2, 0.06, "#7a5528", 0, 2.1, 0));
  g.add(box(1.68, 1.08, 0.04, "#c99a5b", 0, 2.1, 0.03));
  const notes: [number, number, string, number][] = [[-0.5, 2.3, "#ffe27a", 0.1], [-0.1, 2.15, "#ff9fb0", -0.12], [0.4, 2.3, "#9fe0ff", 0.08], [-0.4, 1.9, "#b7f0a0", -0.06], [0.2, 1.92, "#ffe27a", 0.14], [0.6, 1.95, "#ff9fb0", -0.1]];
  for (const [x, y, c, r] of notes) {
    const note = box(0.28, 0.28, 0.012, c, x, y, 0.06);
    note.rotation.z = r;
    g.add(note);
    g.add(ball(0.025, "#e0556b", x, y + 0.1, 0.075));
  }
  return g;
}

export function makePoster(text: string, sub: string, color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.1, 1.5, 0.05, "#2a2a3a", 0, 2.0, 0));
  const face = drawn(1.0, 1.4, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.5, h * 0.45);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    fitFont(ctx, text, 44, w * 0.86);
    ctx.fillText(text, w / 2, h * 0.2);
    fitFont(ctx, sub, 15, w * 0.9, "normal");
    ctx.fillText(sub, w / 2, h * 0.93);
  });
  face.position.set(0, 2.0, 0.03);
  g.add(face);
  return g;
}

export function makeSign(text: string): THREE.Group {
  const g = new THREE.Group();
  const face = drawn(3.4, 0.6, (ctx, w, h) => {
    ctx.fillStyle = "#1f2633";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#7aa2ff";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, text, 72, w * 0.88);
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
  g.add(box(3.5, 0.7, 0.06, "#2a2a3a", 0, 3.2, 0));
  face.position.set(0, 3.2, 0.035);
  g.add(face);
  return g;
}

/** Text as a flat sprite, drawn on a canvas. */
export function makeLabel(text: string, color = "#ffffff"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(10,14,24,0.85)";
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}
