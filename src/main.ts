import * as THREE from "three";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#office")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1d2433");

// Fixed isometric view: orthographic camera at 45° around, looking down.
const VIEW_HEIGHT = 12;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight("#ffffff", 0.7));
const sun = new THREE.DirectionalLight("#ffffff", 1.2);
sun.position.set(5, 10, 3);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshStandardMaterial({ color: "#3a4a6b" }));
floor.position.y = -0.1;
scene.add(floor);

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW_HEIGHT * aspect) / 2;
  camera.right = (VIEW_HEIGHT * aspect) / 2;
  camera.top = VIEW_HEIGHT / 2;
  camera.bottom = -VIEW_HEIGHT / 2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => renderer.render(scene, camera));
