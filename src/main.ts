import "./style.css";
import { createOffice } from "./office.ts";
import { createPanel } from "./panel.ts";
import { tick } from "./state.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#office")!;
const stage = document.querySelector<HTMLElement>("#stage")!;

const panel = createPanel(document.querySelector<HTMLElement>("#panel")!, () => select(null));
const office = createOffice(canvas, stage, (id) => select(id));

function select(id: string | null) {
  office.select(id);
  panel.show(id);
}

// Sign out exists only where the Worker (and so a session) does; the local dev server has neither.
if (import.meta.env.PROD) {
  const signout = document.querySelector<HTMLButtonElement>("#signout")!;
  signout.hidden = false;
  signout.onclick = async () => {
    await fetch("/logout", { method: "POST" });
    location.replace("/login");
  };
}

// The fake world: allowances drain and tasks finish. The real backend replaces this in slice 1.
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  tick((now - last) / 1000);
  last = now;
}, 250);
