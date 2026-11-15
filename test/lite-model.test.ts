import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildLiteModel, jointOf, roleOf, type LiteObject } from "../src/lite-model.ts";

const sample: LiteObject[] = [
  {
    id: "body", kind: "group", name: "joint:body",
    children: [
      { id: "torso", kind: "capsule", name: "torso @shirt", size: [0.3, 1.0], pos: [0, 1.3, 0], material: { color: "#ff0000" } },
      { id: "head", kind: "group", name: "joint:head", pos: [0, 1.66, 0], children: [{ id: "skull", kind: "sphere", name: "skull @skin", size: [0.27], material: { color: "#f2c48d" } }] },
      { id: "arm", kind: "group", name: "joint:armL", pos: [-0.42, 1.52, 0], rot: [0, 0, 90], children: [] },
      { id: "label", kind: "text", name: "ignored" },
    ],
  },
];

test("names carry joints and recolour roles", () => {
  assert.equal(jointOf("joint:head"), "head");
  assert.equal(jointOf("head"), null);
  assert.equal(roleOf("torso @shirt"), "shirt");
  assert.equal(roleOf("torso @banana"), null);
});

test("joints are exposed as groups with their pivot position", () => {
  const { joints } = buildLiteModel(sample);
  assert.deepEqual(Object.keys(joints).sort(), ["armL", "body", "head"]);
  assert.equal(joints.head.position.y, 1.66);
  assert.ok(Math.abs(joints.armL.rotation.z - Math.PI / 2) < 1e-9, "rot is read as degrees");
});

test("roles are retinted and everything else keeps its colour", () => {
  const { group } = buildLiteModel(sample, { shirt: "#0000ff" });
  const colors: Record<string, string> = {};
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) colors[o.name] = (o.material as THREE.MeshStandardMaterial).color.getHexString();
  });
  assert.equal(colors["torso @shirt"], "0000ff");
  assert.equal(colors["skull @skin"], "f2c48d");
});

test("a Lite capsule keeps its whole length and unsupported kinds are skipped", () => {
  const { group } = buildLiteModel(sample);
  const torso = group.getObjectByName("torso @shirt") as THREE.Mesh;
  torso.geometry.computeBoundingBox();
  const box = torso.geometry.boundingBox!;
  assert.ok(Math.abs(box.max.y - box.min.y - 1.0) < 1e-6, "height is the whole length");
  assert.equal(group.getObjectByName("ignored"), undefined);
});
