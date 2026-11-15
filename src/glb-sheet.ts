// Dev-only sheet for the skinned characters (npm run dev, then /glb.html). Not part of the build.
//   ?clip=Walk_Formal_Loop shows everyone in one clip; by default each plays a different one. ?yaw=0.4 turns them. ?n=8 how many.
import * as THREE from "three";
import { createActor, loadKit, lookToActor } from "./actors.ts";
import { employees, fillOffice } from "./state.ts";

fillOffice(30);
const params = new URLSearchParams(location.search);
const n = Number(params.get("n") ?? 8);
const yaw = Number(params.get("yaw") ?? 0.35);
const clipParam = params.get("clip");
const CLIPS = ["Idle_Loop", "Walk_Formal_Loop", "Idle_Talking_Loop", "Idle_FoldArms_Loop", "Idle_TalkingPhone_Loop", "Walk_Loop", "Sitting_Idle_Loop", "Idle_No_Loop"];

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#2a3350");
scene.add(new THREE.HemisphereLight("#e6eeff", "#4a5070", 1.2));
const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
sun.position.set(4, 8, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 6, bottom: -4, near: 1, far: 30 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshStandardMaterial({ color: "#414f72" }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const cam = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, 1.5, n > 4 ? 15 : 9);
cam.lookAt(0, 0.95, 0);

const kit = await loadKit();
const actors = employees.slice(0, n).map((e, i) => {
  const a = createActor(kit, lookToActor(e.look, i));
  a.group.position.set((i - (n - 1) / 2) * 1.9, 0, 0);
  a.group.rotation.y = yaw;
  a.play(clipParam ?? CLIPS[i % CLIPS.length], 0);
  a.mixer.setTime(i * 0.37);
  scene.add(a.group);
  return a;
});
// ?bone=lowerarm_r&axis=x&deg=60 bends a bone after the animation, to find out which axis does what
const boneName = params.get("bone");
const axis = (params.get("axis") ?? "x") as "x" | "y" | "z";
const rad = (Number(params.get("deg") ?? 0) * Math.PI) / 180;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  for (const a of actors) {
    a.update(dt);
    const overlay = params.get("overlay");
    if (overlay) a.overlay(overlay as "typing" | "sleeping", clock.elapsedTime, 0);
    const bone = boneName ? a.group.getObjectByName(boneName) : null;
    if (bone) (axis === "x" ? bone.rotateX : axis === "y" ? bone.rotateY : bone.rotateZ).call(bone, rad);
  }
  renderer.render(scene, cam);
});
(window as unknown as { __ready: boolean }).__ready = true;
