// Turns a model designed in Lite (a scene's `objects` JSON, see docs/lite-asset-format.md) into three.js objects.
// Lite's scenes are data only: boxes, spheres, cylinders, cones, capsules, tori, planes and groups. This is the other half of
// "design it in Lite, use it here". Conventions live in the object `name`:
//   `joint:head`      a group that becomes a named joint (pivot) the app can rotate
//   `@shirt` ...      a recolour role: the app can retint it per employee
import * as THREE from "three";

export type LiteMaterial = { color: string; roughness?: number; metalness?: number; emissive?: string; opacity?: number };
export type LiteObject = {
  id: string;
  kind: string;
  name?: string;
  pos?: number[];
  rot?: number[];
  scale?: number[];
  size?: number[];
  material?: LiteMaterial;
  children?: LiteObject[];
};

export const ROLES = ["shirt", "pants", "shoes", "hair", "skin"] as const;
export type Role = (typeof ROLES)[number];

export type LiteModel = {
  group: THREE.Group;
  /** Groups named `joint:<name>`, by name. */
  joints: Record<string, THREE.Group>;
};

const DEG = Math.PI / 180;

/** The recolour role in a name such as "torso @shirt", or null. */
export function roleOf(name: string | undefined): Role | null {
  const m = /@(\w+)/.exec(name ?? "");
  return m && (ROLES as readonly string[]).includes(m[1]) ? (m[1] as Role) : null;
}

/** The joint name in a name such as "joint:head", or null. */
export function jointOf(name: string | undefined): string | null {
  const m = /^joint:(\w+)/.exec(name ?? "");
  return m ? m[1] : null;
}

function geometryFor(o: LiteObject): THREE.BufferGeometry | null {
  const s = o.size ?? [];
  switch (o.kind) {
    case "box": return new THREE.BoxGeometry(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1);
    case "sphere": return new THREE.SphereGeometry(s[0] ?? 1, 20, 14);
    case "cylinder": return new THREE.CylinderGeometry(s[0] ?? 1, s[0] ?? 1, s[1] ?? 2, 20);
    case "cone": return new THREE.ConeGeometry(s[0] ?? 1, s[1] ?? 2, 20);
    case "capsule": {
      const r = s[0] ?? 1;
      // Lite's capsule height is the whole length; three's takes the straight middle part.
      return new THREE.CapsuleGeometry(r, Math.max(0, (s[1] ?? 2) - 2 * r), 6, 14);
    }
    case "torus": return new THREE.TorusGeometry(s[0] ?? 1, s[1] ?? 0.3, 10, 24);
    case "plane": return new THREE.PlaneGeometry(s[0] ?? 1, s[1] ?? 1); // Lite planes lie in XY and are double-sided
    default: return null;
  }
}

export function buildLiteModel(objects: LiteObject[], tint: Partial<Record<Role, string>> = {}): LiteModel {
  const joints: Record<string, THREE.Group> = {};

  const place = (node: THREE.Object3D, o: LiteObject) => {
    if (o.pos) node.position.set(o.pos[0] ?? 0, o.pos[1] ?? 0, o.pos[2] ?? 0);
    if (o.rot) node.rotation.set((o.rot[0] ?? 0) * DEG, (o.rot[1] ?? 0) * DEG, (o.rot[2] ?? 0) * DEG, "XYZ");
    if (o.scale) node.scale.set(o.scale[0] ?? 1, o.scale[1] ?? 1, o.scale[2] ?? 1);
  };

  const make = (o: LiteObject): THREE.Object3D | null => {
    if (o.kind === "group") {
      const g = new THREE.Group();
      g.name = o.name ?? o.id;
      place(g, o);
      const joint = jointOf(o.name);
      if (joint) joints[joint] = g;
      for (const child of o.children ?? []) {
        const built = make(child);
        if (built) g.add(built);
      }
      return g;
    }
    const geo = geometryFor(o);
    if (!geo) return null; // text, terrain and repeaters are not used for characters and props
    const role = roleOf(o.name);
    const m = o.material;
    const material = new THREE.MeshStandardMaterial({
      color: (role && tint[role]) || m?.color || "#cccccc",
      roughness: m?.roughness ?? 0.8,
      metalness: m?.metalness ?? 0,
      opacity: m?.opacity ?? 1,
      transparent: (m?.opacity ?? 1) < 1,
      side: o.kind === "plane" ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (m?.emissive) {
      material.emissive = new THREE.Color(m.emissive);
      material.emissiveIntensity = 1;
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = o.name ?? o.id;
    place(mesh, o);
    return mesh;
  };

  const group = new THREE.Group();
  for (const o of objects) {
    const built = make(o);
    if (built) group.add(built);
  }
  return { group, joints };
}
