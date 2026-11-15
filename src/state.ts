// Employee state: the contract the office reads. Fake data now; slice 1 replaces `employees` with backend state.

export type Status = "working" | "idle" | "resting";

export type Look = { shirt: string; hair: string; skin: string; accessory: "glasses" | "tie" | "none" };

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
    look: { shirt: "#e0556b", hair: "#5a3a22", skin: "#f2c48d", accessory: "tie" },
    status: "idle",
    allowance: { used: 0, total: 20 },
    personality: "Loud, eager, sure everything is going great. Starts before reading the brief.",
    log: [{ at: "09:02", text: "Arrived. Announced he is a team player." }],
    memory: ["The boss likes short answers.", "Printer is not his fault."],
  },
  {
    id: "nora",
    name: "Nora Quill",
    look: { shirt: "#4aa3df", hair: "#1f1f2e", skin: "#d9a066", accessory: "glasses" },
    status: "idle",
    allowance: { used: 0, total: 20 },
    personality: "Dry, careful, checks twice. Says little and is usually right.",
    log: [{ at: "09:05", text: "Arrived. Reorganised the shared drive." }],
    memory: ["Cites sources.", "Gary will copy her work."],
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
