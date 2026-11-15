import "./style.css";
import { createOffice } from "./office.ts";
import { createPanel } from "./panel.ts";
import { fillOffice, seedActivity, stir, tick } from "./state.ts";
import { loadKit } from "./actors.ts";
import { createList, createMinimap } from "./ui.ts";
import type { Mode } from "./camera-rig.ts";

// 30 placeholder employees until the backend (slice 1) supplies real ones.
fillOffice(30);
seedActivity();

const canvas = document.querySelector<HTMLCanvasElement>("#office")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>("#modes button")];

const panel = createPanel(document.querySelector<HTMLElement>("#panel")!, () => select(null));
const loading = document.querySelector<HTMLElement>("#loading");
const kit = await loadKit(); // the characters and their animations: tens of megabytes, so the office waits for them
loading?.remove();
const office = await createOffice(canvas, stage, {
  onSelect: (id) => select(id),
  onMode: (mode) => showMode(mode),
  fade: document.querySelector<HTMLElement>("#fade") ?? undefined,
}, kit);

function select(id: string | null) {
  office.select(id);
  panel.show(id);
}

// People list and minimap: picking someone selects them (panel opens) and moves the overhead view to them
const pick = (id: string) => {
  select(id);
  office.focus(id);
};
createList(document.querySelector<HTMLElement>("#people")!, pick);
createMinimap(document.querySelector<HTMLCanvasElement>("#minimap")!, office, pick, (x, z) => office.focusPoint(x, z));

function showMode(mode: Mode) {
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  stage.dataset.mode = mode;
  document.body.dataset.mode = mode;
}
for (const b of buttons) b.onclick = () => office.setMode(b.dataset.mode as Mode);
showMode("iso");

// Using the task box needs the mouse: let go of the pointer lock from walk mode when it is focused
document.querySelector("#panel")!.addEventListener("focusin", () => {
  if (document.pointerLockElement) document.exitPointerLock();
});

// Sign out exists only where the Worker (and so a session) does; the local dev server has neither.
if (import.meta.env.PROD) {
  const signout = document.querySelector<HTMLButtonElement>("#signout")!;
  signout.hidden = false;
  signout.onclick = async () => {
    await fetch("/logout", { method: "POST" });
    location.replace("/login");
  };
}

// What the selected person is doing right now, under their status in the panel
setInterval(() => {
  if (panel.current) panel.setDoing(office.doing(panel.current));
}, 400);

// The fake world: allowances drain, tasks finish, and a fake manager keeps handing out work.
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  tick(dt);
  stir(dt);
}, 250);
