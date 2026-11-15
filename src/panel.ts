import { find, giveTask, setStatus, subscribe, type Employee, type Status } from "./state.ts";

const STATUS_LABEL: Record<Status, string> = { working: "Working", idle: "On a break", resting: "Resting" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The side panel. The structure is built once per selection and only the changing parts are refreshed, so typing is never interrupted. */
export function createPanel(root: HTMLElement, onClose: () => void) {
  let current: string | null = null;
  let refresh: (() => void) | null = null;

  function show(id: string | null) {
    current = id;
    root.replaceChildren();
    refresh = null;
    root.hidden = id === null;
    const e = id ? find(id) : undefined;
    if (!e) {
      root.hidden = true;
      return;
    }

    const close = el("button", "close", "×");
    close.setAttribute("aria-label", "Close panel");
    close.onclick = onClose;
    const name = el("h2", undefined, e.name);
    const chip = el("span", "chip");
    const personality = el("p", "personality", e.personality);

    const meter = el("div", "meter");
    const fill = el("div", "meter-fill");
    meter.append(fill);
    const meterText = el("div", "small");

    const task = el("p", "task");

    const form = el("form", "assign");
    const input = el("input");
    input.placeholder = "Give a task...";
    input.setAttribute("aria-label", "Task");
    const submit = el("button", undefined, "Assign");
    submit.type = "submit";
    const error = el("div", "error");
    form.append(input, submit);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const problem = giveTask(e.id, input.value);
      error.textContent = problem ?? "";
      if (!problem) input.value = "";
    };

    const dev = el("div", "dev");
    dev.append(el("span", "small", "Dev: set status"));
    for (const s of ["working", "idle", "resting"] as const) {
      const b = el("button", undefined, STATUS_LABEL[s]);
      b.onclick = () => setStatus(e.id, s);
      dev.append(b);
    }

    const logList = el("ul");
    const memList = el("ul");

    root.append(
      close, name, chip, personality,
      el("h3", undefined, "Allowance today"), meter, meterText,
      el("h3", undefined, "Current task"), task,
      form, error, dev,
      el("h3", undefined, "Work log"), logList,
      el("h3", undefined, "Memory"), memList,
    );

    refresh = () => draw(e, { chip, fill, meterText, task, logList, memList, submit });
    refresh();
  }

  subscribe(() => refresh?.());
  return { show, get current() { return current; } };
}

function draw(
  e: Employee,
  v: { chip: HTMLElement; fill: HTMLElement; meterText: HTMLElement; task: HTMLElement; logList: HTMLElement; memList: HTMLElement; submit: HTMLButtonElement },
) {
  v.chip.textContent = STATUS_LABEL[e.status];
  v.chip.dataset.status = e.status;
  const pct = (e.allowance.used / e.allowance.total) * 100;
  v.fill.style.width = `${pct}%`;
  v.meterText.textContent = `${e.allowance.used} of ${e.allowance.total} used`;
  v.task.textContent = e.task ?? "Nothing right now.";
  v.submit.disabled = e.status === "resting";
  v.logList.replaceChildren(...e.log.map((l) => el("li", undefined, `${l.at}  ${l.text}`)));
  v.memList.replaceChildren(...e.memory.map((m) => el("li", undefined, m)));
}
