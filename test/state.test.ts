import { test } from "node:test";
import assert from "node:assert/strict";
import { employees, find, giveTask, setStatus, subscribe, tick, TASK_SECONDS } from "../src/state.ts";

function reset() {
  for (const e of employees) {
    e.status = "idle";
    e.task = undefined;
    e.allowance.used = 0;
  }
}

test("giving a task starts work and notifies listeners", () => {
  reset();
  let calls = 0;
  const off = subscribe(() => calls++);
  assert.equal(giveTask("gary", "  File the TPS reports "), undefined);
  off();
  assert.equal(find("gary")?.status, "working");
  assert.equal(find("gary")?.task, "File the TPS reports");
  assert.ok(calls >= 1);
});

test("empty task and unknown employee are refused", () => {
  reset();
  assert.match(giveTask("gary", "   ") ?? "", /task/i);
  assert.match(giveTask("nobody", "x") ?? "", /No such/);
});

test("a resting employee refuses work", () => {
  reset();
  setStatus("nora", "resting");
  assert.match(giveTask("nora", "anything") ?? "", /resting/);
  assert.equal(find("nora")?.status, "resting");
});

test("a finished task returns the employee to idle", () => {
  reset();
  giveTask("gary", "short job");
  tick(TASK_SECONDS + 1);
  assert.equal(find("gary")?.status, "idle");
  assert.equal(find("gary")?.task, undefined);
});

test("running out of allowance sends the employee to rest", () => {
  reset();
  const e = find("gary")!;
  e.allowance.used = e.allowance.total - 1;
  giveTask("gary", "long job");
  tick(3);
  assert.equal(e.status, "resting");
  assert.equal(e.allowance.used, e.allowance.total);
});
