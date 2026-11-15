// Employee state: the contract the office reads. Fake data now; slice 1 replaces `employees` with backend state.

export type Status = "working" | "idle" | "resting";

export type Look = {
  shirt: string;
  pants: string;
  shoes: string;
  hair: string;
  skin: string;
  hairStyle: "short" | "bob" | "bun" | "curly" | "bald";
  /** Body scale: height and how broad. 1 is average. */
  height: number;
  build: number;
  accessory: "glasses" | "tie" | "lanyard" | "cardigan" | "mustache" | "none";
};

export type Employee = {
  id: string;
  name: string;
  look: Look;
  status: Status;
  task?: string;
  allowance: { used: number; total: number };
  personality: string;
  log: { at: string; text: string }[];
  memory: string[];
};

/** Seconds of work one allowance point costs, and seconds a task takes. */
export const SECONDS_PER_POINT = 2;
export const TASK_SECONDS = 12;

export const employees: Employee[] = [
  {
    id: "gary",
    name: "Gary Pennyworth",
    look: { shirt: "#e0556b", pants: "#2f3350", shoes: "#2a1a14", hair: "#5a3a22", skin: "#f2c48d", hairStyle: "short", height: 1.06, build: 1.12, accessory: "tie" },
    status: "idle",
    allowance: { used: 0, total: 20 },
    personality: "Loud, eager, sure everything is going great. Starts before reading the brief.",
    log: [{ at: "09:02", text: "Arrived. Announced he is a team player." }],
    memory: ["The boss likes short answers.", "Printer is not his fault."],
  },
  {
    id: "nora",
    name: "Nora Quill",
    look: { shirt: "#4aa3df", pants: "#262b3a", shoes: "#14161c", hair: "#1f1f2e", skin: "#d9a066", hairStyle: "bob", height: 0.97, build: 0.92, accessory: "glasses" },
    status: "idle",
    allowance: { used: 0, total: 20 },
    personality: "Dry, careful, checks twice. Says little and is usually right.",
    log: [{ at: "09:05", text: "Arrived. Reorganised the shared drive." }],
    memory: ["Cites sources.", "Gary will copy her work."],
  },
  {
    id: "priya",
    name: "Priya Raman",
    look: { shirt: "#58b36c", pants: "#3a3347", shoes: "#e8e2d0", hair: "#2a1a14", skin: "#b9784a", hairStyle: "bun", height: 0.93, build: 0.98, accessory: "lanyard" },
    status: "idle",
    allowance: { used: 0, total: 20 },
    personality: "Placeholder: cheerful, always organising something.",
    log: [{ at: "09:10", text: "Arrived. Brought snacks." }],
    memory: ["Knows where everything is."],
  },
  {
    id: "walt",
    name: "Walt Dunning",
    look: { shirt: "#e8e2d0", pants: "#4a4a55", shoes: "#2a2a30", hair: "#999999", skin: "#e8b48a", hairStyle: "bald", height: 1.02, build: 1.22, accessory: "mustache" },
    status: "idle",
    allowance: { used: 0, total: 20 },
    personality: "Placeholder: has seen it all, mentions it often.",
    log: [{ at: "08:55", text: "Arrived first. Told a story about 1998." }],
    memory: ["Prefers the old process."],
  },
];

type Listener = () => void;
const listeners = new Set<Listener>();
const workLeft = new Map<string, number>();
const secondsWorked = new Map<string, number>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  listeners.forEach((fn) => fn());
}

function clock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function note(e: Employee, text: string) {
  e.log.unshift({ at: clock(), text });
  if (e.log.length > 20) e.log.pop();
}

export function find(id: string): Employee | undefined {
  return employees.find((e) => e.id === id);
}

/** Dev control: force a status. Working without a task gets a placeholder so the panel never shows an empty job. */
export function setStatus(id: string, status: Status) {
  const e = find(id);
  if (!e || e.status === status) return;
  e.status = status;
  if (status === "working") {
    e.task ??= "Looking busy";
    workLeft.set(id, TASK_SECONDS);
  } else {
    e.task = undefined;
    workLeft.delete(id);
  }
  note(e, status === "resting" ? "Went to rest." : status === "idle" ? "Took a break." : "Back at the desk.");
  changed();
}

/** Stub for the backend: give a task and the employee starts working. Returns an error message when refused. */
export function giveTask(id: string, text: string): string | undefined {
  const e = find(id);
  const task = text.trim();
  if (!e) return "No such employee.";
  if (!task) return "Write a task first.";
  if (e.status === "resting") return `${e.name} is resting until tomorrow.`;
  e.task = task;
  e.status = "working";
  workLeft.set(id, TASK_SECONDS);
  note(e, `Started: ${task}`);
  changed();
}

/** Advance the fake world by dt seconds: working spends allowance and finishes tasks; an empty allowance sends them to rest. */
export function tick(dt: number) {
  let any = false;
  for (const e of employees) {
    if (e.status !== "working") continue;
    any = true;
    const spent = (secondsWorked.get(e.id) ?? 0) + dt;
    const points = Math.floor(spent / SECONDS_PER_POINT);
    secondsWorked.set(e.id, spent - points * SECONDS_PER_POINT);
    e.allowance.used = Math.min(e.allowance.total, e.allowance.used + points);
    const left = (workLeft.get(e.id) ?? TASK_SECONDS) - dt;
    if (e.allowance.used >= e.allowance.total) {
      note(e, "Out of allowance. Resting until tomorrow.");
      e.status = "resting";
      e.task = undefined;
      workLeft.delete(e.id);
    } else if (left <= 0) {
      note(e, `Finished: ${e.task}`);
      e.status = "idle";
      e.task = undefined;
      workLeft.delete(e.id);
    } else {
      workLeft.set(e.id, left);
    }
  }
  if (any) changed();
}
