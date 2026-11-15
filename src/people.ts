// Dev-only character sheet for design review (npm run dev, then /people.html?yaw=0.8). Not part of the build.
import * as THREE from "three";
import { makeCharacter } from "./models.ts";
import { employees } from "./state.ts";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#2a3350");
scene.add(new THREE.HemisphereLight("#e6eeff", "#4a5070", 1.3));
const sun = new THREE.DirectionalLight("#fff1dc", 2);
sun.position.set(3, 6, 8);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, 2.4, 14);
cam.lookAt(0, 1.2, 0);
const params = new URLSearchParams(location.search);
const yaw = Number(params.get("yaw") ?? 0);
employees.forEach((e, i) => {
  const ch = makeCharacter(e.look);
  ch.group.position.set((i - 1.5) * 2.2, 0, 0);
  ch.group.rotation.y = yaw;
  ch.leftForearm.rotation.x = -0.15;
  ch.rightForearm.rotation.x = -0.15;
  scene.add(ch.group);
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshStandardMaterial({ color: "#414f72" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
renderer.render(scene, cam);
