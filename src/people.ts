// Dev-only character sheet for design review (npm run dev, then /people.html?yaw=0.8). Not part of the build.
// Back row: the characters built in code (src/models.ts). Front row: the same employees from the Lite design (src/assets/character-base.lite.json).
import * as THREE from "three";
import { makeCharacter } from "./models.ts";
import { buildLiteModel, type LiteObject } from "./lite-model.ts";
import base from "./assets/character-base.lite.json";
import { employees, fillOffice } from "./state.ts";

fillOffice(8);
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
const params = new URLSearchParams(location.search);
const yaw = Number(params.get("yaw") ?? 0);
const only = params.get("row"); // "code" or "lite" to show one row, bigger
const cam = new THREE.PerspectiveCamera(only ? 24 : 34, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, only ? 1.6 : 2.6, only ? 16 : 17);
cam.lookAt(0, only ? 0.95 : 1.1, 0);

const shown = employees.slice(0, 8);
shown.forEach((e, i) => {
  const x = (i - (shown.length - 1) / 2) * 2.1;
  if (only !== "lite") {
    const ch = makeCharacter(e.look);
    ch.group.position.set(x, 0, only ? 0 : -2.2);
    ch.group.rotation.y = yaw;
    ch.leftForearm.rotation.x = -0.15;
    ch.rightForearm.rotation.x = -0.15;
    scene.add(ch.group);
  }
  if (only !== "code") {
    const { group, joints } = buildLiteModel(base as LiteObject[], { shirt: e.look.shirt, pants: e.look.pants, shoes: e.look.shoes, hair: e.look.hair, skin: e.look.skin });
    group.position.set(x, 0, only ? 0 : 0.6);
    group.rotation.y = yaw;
    group.scale.set(e.look.build * e.look.height, e.look.height, e.look.build * e.look.height);
    if (joints.forearmL) joints.forearmL.rotation.x = -0.15;
    if (joints.forearmR) joints.forearmR.rotation.x = -0.15;
    scene.add(group);
  }
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshStandardMaterial({ color: "#414f72" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
renderer.render(scene, cam);
