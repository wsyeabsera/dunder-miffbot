// Skinned, textured characters: Quaternius' CC0 Universal Base Characters and Universal Animation Libraries (public/assets/characters).
// The free base bodies come in underwear, so each actor is dressed with clothing "shells": copies of the body triangles that belong to
// the shirt, trousers or shoes, pushed a little outward along the normals and skinned to the same skeleton, so clothes move with the body.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Look } from "./state.ts";

const BASE = "/assets/characters/";

export type Sex = "male" | "female";
export type HairName = "none" | "Buzzed" | "BuzzedFemale" | "SimpleParted" | "Long" | "Buns";
export type ActorLook = {
  sex: Sex;
  skin: "light" | "dark";
  skinTint: string;
  hair: HairName;
  hairColor: string;
  beard: boolean;
  glasses: boolean;
  shirt: string;
  pants: string;
  shoes: string;
  height: number;
  build: number;
};

type Shells = { shirt: THREE.BufferGeometry; pants: THREE.BufferGeometry; shoes: THREE.BufferGeometry };
type Base = { scene: THREE.Group; shells: Shells; light: THREE.Texture };
export type Kit = {
  bases: Record<Sex, Base>;
  hairs: Map<string, THREE.Object3D>;
  clips: Map<string, THREE.AnimationClip>;
};

type Region = {
  bones: RegExp;
  offset: number;
  /** Height range as a fraction of the body, for a straight hem. */
  y: [number, number];
  /** Parts of the garment that hang looser (the body of a shirt, the thighs of trousers), and by how much more. */
  loose?: { bones: RegExp; extra: number };
};
const REGIONS: Record<keyof Shells, Region> = {
  shirt: { bones: /^(spine_0[1-3]|clavicle_|upperarm_|pelvis)/i, offset: 0.012, y: [0.5, 1], loose: { bones: /^(spine_0[1-3]|pelvis)/i, extra: 1.5 } },
  pants: { bones: /^(pelvis|thigh_|calf_)/i, offset: 0.018, y: [0.04, 0.62], loose: { bones: /^(pelvis|thigh_)/i, extra: 0.9 } },
  shoes: { bones: /^(foot_|ball_)/i, offset: 0.028, y: [0, 0.075] },
};

function bodyOf(root: THREE.Object3D): THREE.SkinnedMesh {
  let best: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o;
  });
  if (!best) throw new Error("no body mesh");
  return best;
}

/** Copies the body triangles whose vertices belong to the region (by skin weight), pushed out along their normals. */
function shell(body: THREE.SkinnedMesh, region: Region, scale: number): THREE.BufferGeometry {
  const g = body.geometry;
  const bones = body.skeleton.bones;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  const tall = g.boundingBox!.max.y - minY;
  const inRegion = new Uint8Array(pos.count);
  const matches = bones.map((b) => region.bones.test(b.name));
  for (let v = 0; v < pos.count; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (matches[si.getComponent(v, k)]) w += sw.getComponent(v, k);
    const rel = (pos.getY(v) - minY) / tall;
    inRegion[v] = w > 0.5 && rel >= region.y[0] && rel <= region.y[1] ? 1 : 0;
  }
  const index = g.index!;
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (inRegion[a] && inRegion[b] && inRegion[c]) kept.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  const moved = new Float32Array(pos.count * 3);
  const loose = region.loose ? bones.map((b) => region.loose!.bones.test(b.name)) : null;
  for (let v = 0; v < pos.count; v++) {
    // Hang looser where the garment is loose: scale the push-out by how much of this vertex follows a loose bone
    let lw = 0;
    if (loose) for (let k = 0; k < 4; k++) if (loose[si.getComponent(v, k)]) lw += sw.getComponent(v, k);
    const push = region.offset * scale * (1 + (region.loose?.extra ?? 0) * Math.min(1, lw));
    moved[v * 3] = pos.getX(v) + nor.getX(v) * push;
    moved[v * 3 + 1] = pos.getY(v) + nor.getY(v) * push;
    moved[v * 3 + 2] = pos.getZ(v) + nor.getZ(v) * push;
  }
  out.setAttribute("position", new THREE.BufferAttribute(moved, 3));
  out.setAttribute("normal", nor);
  if (g.attributes.uv) out.setAttribute("uv", g.attributes.uv);
  out.setAttribute("skinIndex", si);
  out.setAttribute("skinWeight", sw);
  out.setIndex(kept);
  return out;
}

export async function loadKit(): Promise<Kit> {
  const loader = new GLTFLoader();
  const load = (f: string) => loader.loadAsync(BASE + f);
  const [male, female, ual1, ual2] = await Promise.all([load("Superhero_Male_FullBody.gltf"), load("Superhero_Female_FullBody.gltf"), load("UAL1_Standard.glb"), load("UAL2_Standard.glb")]);
  const hairNames = ["Buzzed", "BuzzedFemale", "SimpleParted", "Long", "Buns", "Beard", "Eyebrows_Regular", "Eyebrows_Female"];
  const hairFiles = await Promise.all(hairNames.map((n) => load(n.startsWith("Eyebrows") ? `${n}.gltf` : `Hair_${n}.gltf`)));
  const textures = new THREE.TextureLoader();
  const lightMale = textures.load(BASE + "T_Superhero_Male_Light_BaseColor.png");
  const lightFemale = textures.load(BASE + "T_Superhero_Female_Light_BaseColor.png");
  for (const t of [lightMale, lightFemale]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // glTF convention
  }

  const prepare = (gltf: { scene: THREE.Group }, lightTex: THREE.Texture): Base => {
    gltf.scene.updateMatrixWorld(true);
    const body = bodyOf(gltf.scene);
    body.geometry.computeBoundingBox();
    const height = body.geometry.boundingBox!.max.y - body.geometry.boundingBox!.min.y;
    const scale = height / 1.8; // thicknesses below are in metres for a 1.8 m person
    return { scene: gltf.scene, light: lightTex, shells: { shirt: shell(body, REGIONS.shirt, scale), pants: shell(body, REGIONS.pants, scale), shoes: shell(body, REGIONS.shoes, scale) } };
  };

  const clips = new Map<string, THREE.AnimationClip>();
  for (const g of [ual1, ual2]) for (const c of g.animations) clips.set(c.name, c);
  const hairs = new Map<string, THREE.Object3D>();
  hairNames.forEach((n, i) => hairs.set(n, hairFiles[i].scene));

  return { bases: { male: prepare(male, lightMale), female: prepare(female, lightFemale) }, hairs, clips };
}

/** Round glasses, built in the character's rest pose in front of the eyes and then fixed to the head bone. */
function makeGlasses(head: THREE.Bone): THREE.Group {
  const eyes = new THREE.Vector3();
  head.getWorldPosition(eyes);
  eyes.add(new THREE.Vector3(0, 0.082, 0.1)); // between the eyes, a hair in front of the face
  const frame = new THREE.MeshStandardMaterial({ color: "#1b1b24", roughness: 0.35, metalness: 0.3 });
  const g = new THREE.Group();
  for (const x of [-0.034, 0.034]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0035, 8, 24), frame);
    ring.position.set(x, 0, 0);
    g.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0265, 20), new THREE.MeshStandardMaterial({ color: "#cfe6ff", transparent: true, opacity: 0.12, roughness: 0.05 }));
    lens.position.set(x, 0, 0);
    g.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.085), frame);
    arm.position.set(x * 2.05, 0, -0.04);
    g.add(arm);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), frame));
  g.position.copy(eyes);
  g.updateMatrixWorld(true);
  g.applyMatrix4(head.matrixWorld.clone().invert());
  return g;
}

export type Actor = {
  group: THREE.Group;
  /** The head bone (for the point-of-view camera). */
  head: THREE.Bone;
  mixer: THREE.AnimationMixer;
  look: ActorLook;
  /** Bend bones on top of the playing clip (call after `update`): typing at a keyboard, or slumped asleep. */
  overlay(kind: "none" | "typing" | "sleeping", time: number, phase: number): void;
  /** Cross-fade to a clip by name. */
  play(name: string, fade?: number): void;
  update(dt: number): void;
};

export function createActor(kit: Kit, look: ActorLook): Actor {
  const base = kit.bases[look.sex];
  const group = clone(base.scene) as THREE.Group;
  const body = bodyOf(group);
  group.updateMatrixWorld(true);
  const bones: Record<string, THREE.Bone> = {};
  body.skeleton.bones.forEach((b) => (bones[b.name] = b));

  // Skin: the dark texture ships on the glTF, the light one is swapped in. Tint for the in-between tones.
  const skinMat = (body.material as THREE.MeshStandardMaterial).clone();
  if (look.skin === "light") skinMat.map = base.light;
  skinMat.color = new THREE.Color(look.skinTint);
  body.material = skinMat;

  // Replace the default hair mesh (the one with a hair material) with the chosen hair and eyebrows
  const doomed: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== body && /hair/i.test((o.material as THREE.Material).name)) doomed.push(o);
  });
  for (const o of doomed) o.removeFromParent();

  const head = bones["Head"] ?? bones["head"];
  const invHead = head.matrixWorld.clone().invert();
  const attach = (name: string, tint?: string) => {
    const src = kit.hairs.get(name);
    if (!src) return;
    const obj = clone(src);
    obj.applyMatrix4(invHead);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = (o.material as THREE.MeshStandardMaterial).clone();
        if (tint) m.color = new THREE.Color(tint);
        o.material = m;
        o.castShadow = true;
      }
    });
    head.add(obj);
  };
  attach(look.sex === "male" ? "Eyebrows_Regular" : "Eyebrows_Female", look.hairColor);
  if (look.hair !== "none") attach(look.hair, look.hairColor);
  if (look.beard) attach("Beard", look.hairColor);

  if (look.glasses) head.add(makeGlasses(head));

  // Clothes
  const dress = (geo: THREE.BufferGeometry, color: string, roughness: number) => {
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
    mesh.bind(body.skeleton, body.bindMatrix);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    body.parent!.add(mesh);
  };
  dress(base.shells.pants, look.pants, 0.85);
  dress(base.shells.shirt, look.shirt, 0.8);
  dress(base.shells.shoes, look.shoes, 0.55);

  group.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.scale.set(look.build * look.height, look.height, look.build * look.height);

  const mixer = new THREE.AnimationMixer(group);
  let current: THREE.AnimationAction | null = null;
  return {
    group,
    head,
    mixer,
    look,
    play(name, fade = 0.3) {
      const clip = kit.clips.get(name);
      if (!clip) throw new Error(`no clip ${name}`);
      const next = mixer.clipAction(clip);
      if (next === current) return;
      next.reset().setEffectiveWeight(1).fadeIn(fade).play();
      current?.fadeOut(fade);
      current = next;
    },
    update(dt) {
      mixer.update(dt);
    },
    overlay(kind, time, phase) {
      // Found by bending each bone on the dev sheet: rotating about local X flexes the elbow and nods the neck.
      if (kind === "typing") {
        bones["lowerarm_l"]?.rotateX(0.75 + Math.sin(time * 13 + phase) * 0.09);
        bones["lowerarm_r"]?.rotateX(0.75 + Math.sin(time * 13 + phase + 2.1) * 0.09);
        bones["neck_01"]?.rotateX(0.2 + Math.sin(time * 1.3 + phase) * 0.03);
      } else if (kind === "sleeping") {
        bones["neck_01"]?.rotateX(0.7);
        bones["spine_03"]?.rotateX(0.18);
      }
    },
  };
}

/** Map an employee's Look (the primitive-era description) onto the real characters. */
export function lookToActor(look: Look, index: number): ActorLook {
  const female = look.hairStyle === "bob" || look.hairStyle === "bun" || (look.hairStyle === "curly" && index % 2 === 0);
  const hair: HairName =
    look.hairStyle === "bald" ? "none" : look.hairStyle === "bun" ? "Buns" : look.hairStyle === "bob" ? "Long" : look.hairStyle === "curly" ? (female ? "Long" : "Buzzed") : "SimpleParted";
  // Perceived brightness of the skin colour, 0..1 (read from the hex, not the linear colour three.js stores)
  const hex = parseInt(look.skin.slice(1), 16);
  const lum = (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255;
  const light = lum > 0.62;
  const tint = light ? Math.min(1, 0.78 + (lum - 0.62) * 1.4) : Math.min(1, 0.55 + lum * 0.9);
  return {
    sex: female ? "female" : "male",
    skin: light ? "light" : "dark",
    skinTint: "#" + new THREE.Color().setRGB(tint, tint * (light ? 0.97 : 0.95), tint * (light ? 0.95 : 0.9)).getHexString(),
    hair,
    hairColor: look.hair,
    beard: look.accessory === "mustache" && !female,
    glasses: look.accessory === "glasses",
    shirt: look.shirt,
    pants: look.pants,
    shoes: look.shoes,
    height: look.height,
    build: Math.min(1.08, Math.max(0.94, look.build)),
  };
}
