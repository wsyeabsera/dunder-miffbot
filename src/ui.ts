// Overlay UI that is not the 3D scene: the people list with search, and the minimap.
import { employees, subscribe, type Status } from "./state.ts";
import type { Office } from "./office.ts";
import { BOUNDS } from "./world/level.ts";

const COLORS: Record<Status, string> = { working: "#4ade80", idle: "#facc15", resting: "#94a3b8" };

/** A searchable list of everyone, with a status dot. Clicking a name selects them and moves the overhead view to them. */
export function createList(root: HTMLElement, onPick: (id: string) => void) {
  const input = root.querySelector<HTMLInputElement>("input")!;
  const list = root.querySelector<HTMLUListElement>("ul")!;
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren(
      ...employees
        .filter((e) => e.name.toLowerCase().includes(q))
        .map((e) => {
          const li = document.createElement("li");
          const b = document.createElement("button");
          const dot = document.createElement("span");
          dot.className = "dot";
          dot.style.background = COLORS[e.status];
          b.append(dot, document.createTextNode(e.name));
          b.onclick = () => onPick(e.id);
          li.append(b);
          return li;
        }),
    );
  };
  input.addEventListener("input", draw);
  subscribe(draw);
  draw();
}

/** A top-down map of the building with everyone as a dot; click a dot to pick them, or the floor to move the view there. */
export function createMinimap(canvas: HTMLCanvasElement, office: Office, onPick: (id: string) => void, onPoint: (x: number, z: number) => void) {
  const level = office.level;
  const W = canvas.width;
  const k = W / (BOUNDS.x1 - BOUNDS.x0 + 1);
  canvas.height = Math.round((BOUNDS.z1 - BOUNDS.z0 + 1) * k);
  const ctx = canvas.getContext("2d")!;
  const sx = (x: number) => (x - BOUNDS.x0) * k;
  const sz = (z: number) => (z - BOUNDS.z0) * k;

  // The building never changes, so draw it once.
  const base = document.createElement("canvas");
  base.width = canvas.width;
  base.height = canvas.height;
  const b = base.getContext("2d")!;
  b.fillStyle = "#2a3350";
  b.fillRect(0, 0, base.width, base.height);
  for (const r of level.rooms) {
    b.fillStyle = r.floor;
    b.globalAlpha = 0.55;
    b.fillRect(sx(r.rect.x0), sz(r.rect.z0), (r.rect.x1 - r.rect.x0) * k, (r.rect.z1 - r.rect.z0) * k);
  }
  b.globalAlpha = 1;
  b.fillStyle = "#d9d2b8";
  const walls = level.walls;
  for (let row = 0; row < walls.rows; row++) for (let col = 0; col < walls.cols; col++) if (walls.solid[walls.index(col, row)]) b.fillRect(sx(walls.x0 + col * 0.5), sz(walls.z0 + row * 0.5), Math.max(1, 0.5 * k), Math.max(1, 0.5 * k));

  const draw = () => {
    ctx.drawImage(base, 0, 0);
    for (const p of office.positions()) {
      ctx.fillStyle = COLORS[p.status];
      ctx.beginPath();
      ctx.arc(sx(p.x), sz(p.z), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const boss = office.boss();
    if (boss) {
      ctx.fillStyle = "#7aa2ff";
      ctx.beginPath();
      ctx.arc(sx(boss.x), sz(boss.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  setInterval(draw, 150);
  draw();

  canvas.addEventListener("click", (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * (BOUNDS.x1 - BOUNDS.x0 + 1) + BOUNDS.x0;
    const z = ((ev.clientY - r.top) / r.height) * (BOUNDS.z1 - BOUNDS.z0 + 1) + BOUNDS.z0;
    const near = office.positions().filter((p) => Math.hypot(p.x - x, p.z - z) < 1.6).sort((a, c) => Math.hypot(a.x - x, a.z - z) - Math.hypot(c.x - x, c.z - z))[0];
    if (near) onPick(near.id);
    else onPoint(x, z);
  });
}
