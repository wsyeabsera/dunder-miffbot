// Models built from Three.js primitives: no external files, no textures.
import * as THREE from "three";
import type { Look } from "./state.ts";

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

export type Character = {
  group: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  body: THREE.Group;
};

/** Origin at the feet. Faces +z. Limbs hang from pivot groups so they can swing. */
export function makeCharacter(look: Look): Character {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  body.add(box(0.7, 0.8, 0.4, look.shirt, 0, 1.1, 0));
  if (look.accessory === "tie") body.add(box(0.1, 0.5, 0.05, "#2a2a3a", 0, 1.15, 0.22));

  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), mat(look.skin));
  skull.position.y = 0.28;
  head.add(skull);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(look.hair));
  hair.position.y = 0.3;
  hair.rotation.x = -0.25;
  head.add(hair);
  for (const x of [-0.1, 0.1]) head.add(box(0.06, 0.06, 0.04, "#1a1a1a", x, 0.3, 0.26));
  if (look.accessory === "glasses") {
    for (const x of [-0.1, 0.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 16), mat("#222222"));
      ring.position.set(x, 0.3, 0.28);
      head.add(ring);
    }
  }
  body.add(head);

  const limb = (w: number, len: number, color: string, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(box(w, len, w, color, 0, -len / 2, 0));
    body.add(pivot);
    return pivot;
  };
  const leftArm = limb(0.2, 0.7, look.shirt, -0.45, 1.45);
  const rightArm = limb(0.2, 0.7, look.shirt, 0.45, 1.45);
  const leftLeg = limb(0.25, 0.7, "#34344a", -0.18, 0.7);
  const rightLeg = limb(0.25, 0.7, "#34344a", 0.18, 0.7);

  return { group, head, leftArm, rightArm, leftLeg, rightLeg, body };
}

/** Desk with laptop. Origin on the floor at the desk centre; the screen faces +z, where the worker sits. */
export function makeDesk(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2, 0.12, 1.1, "#c9954f", 0, 1.0, 0));
  for (const x of [-0.9, 0.9]) for (const z of [-0.45, 0.45]) g.add(box(0.1, 1.0, 0.1, "#8a6230", x, 0.5, z));
  g.add(box(0.7, 0.04, 0.5, "#9aa3b2", 0, 1.08, 0));
  const screen = box(0.7, 0.45, 0.04, "#2b3445", 0, 1.32, -0.2);
  screen.rotation.x = -0.2;
  g.add(screen);
  const glow = box(0.6, 0.36, 0.01, "#7ec8ff", 0, 1.32, -0.17);
  glow.rotation.x = -0.2;
  (glow.material as THREE.MeshStandardMaterial).emissive = new THREE.Color("#3a8fd0");
  g.add(glow);
  return g;
}

export function makeChair(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.1, 0.7, "#3d4660", 0, 0.7, 0));
  g.add(box(0.7, 0.7, 0.1, "#3d4660", 0, 1.05, -0.3));
  g.add(box(0.1, 0.7, 0.1, "#222833", 0, 0.35, 0));
  g.add(box(0.6, 0.06, 0.6, "#222833", 0, 0.03, 0));
  return g;
}

export function makeCoffeeMachine(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.1, 1.0, 0.9, "#7a5a3a", 0, 0.5, 0));
  g.add(box(0.8, 0.9, 0.7, "#2a2a30", 0, 1.45, 0));
  g.add(box(0.2, 0.2, 0.2, "#e0e0e0", 0, 1.1, 0.4));
  const light = box(0.1, 0.1, 0.05, "#ff5544", 0.25, 1.7, 0.36);
  (light.material as THREE.MeshStandardMaterial).emissive = new THREE.Color("#ff3322");
  g.add(light);
  return g;
}

export function makePlant(): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 14), mat("#a8613a"));
  pot.position.y = 0.25;
  g.add(pot);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mat(i % 2 ? "#3f9b4a" : "#2f7d3a"));
    leaf.position.set(Math.cos(i * 1.3) * 0.2, 0.8 + i * 0.12, Math.sin(i * 1.3) * 0.2);
    g.add(leaf);
  }
  return g;
}

export function makeCouch(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.4, 0.5, 1.0, "#8a4f6a", 0, 0.35, 0));
  g.add(box(2.4, 0.8, 0.25, "#74405a", 0, 0.75, -0.4));
  for (const x of [-1.1, 1.1]) g.add(box(0.2, 0.7, 1.0, "#74405a", x, 0.5, 0));
  return g;
}

export function makeWhiteboard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3, 1.6, 0.08, "#eef1f5", 0, 2.0, 0));
  g.add(box(3.15, 1.75, 0.05, "#9aa3b2", 0, 2.0, -0.03));
  const scribble = (color: string, w: number, y: number) => g.add(box(w, 0.06, 0.02, color, -0.6 + w / 2 - 0.4, y, 0.05));
  scribble("#e0556b", 1.6, 2.5);
  scribble("#4aa3df", 1.1, 2.25);
  scribble("#3f9b4a", 1.9, 2.0);
  scribble("#4aa3df", 0.8, 1.75);
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
