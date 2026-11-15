// The base character, written as a Lite scene (docs/lite-asset-format.md). Run `node scripts/lite/push-character.mjs` to send it to Lite.
// Metres, origin between the feet, faces +z. Joints are groups named `joint:*`; `@role` in a name marks a recolourable material.

const C = { skin: "#f2c48d", shirt: "#4aa3df", pants: "#2f3350", shoes: "#2a1a14", hair: "#5a3a22", belt: "#2a2230", gold: "#c9a14a", white: "#f4f4f6", ink: "#1a1a22", lip: "#a8484e", blush: "#e8907a", sole: "#14161c" };

let n = 0;
const id = (p) => `${p}-${++n}`;
const mat = (color, extra = {}) => ({ color, roughness: 0.8, ...extra });
const obj = (kind, name, pos, size, color, extra = {}) => ({ id: id(name.replace(/[^a-z]+/gi, "-").toLowerCase().slice(0, 24) || kind), kind, name, pos, size, material: mat(color, extra.material), ...(extra.rot ? { rot: extra.rot } : {}), ...(extra.scale ? { scale: extra.scale } : {}), ...(extra.children ? { children: extra.children } : {}) });
const group = (name, pos, children, rot) => ({ id: id(name.replace(/[^a-z]+/gi, "-").toLowerCase().slice(0, 24)), kind: "group", name, pos, ...(rot ? { rot } : {}), children });

export function character(c = C) {
  const leg = (side) => {
    const x = side * 0.16;
    return group(`joint:leg${side < 0 ? "L" : "R"}`, [x, 0.88, 0], [
      obj("capsule", "thigh @pants", [0, -0.4, 0], [0.115, 0.8], c.pants, { scale: [1, 1, 0.95] }),
      obj("cylinder", "cuff @pants", [0, -0.7, 0], [0.122, 0.05], c.pants, { material: { roughness: 0.9 } }),
      obj("box", "sole", [0, -0.875, 0.06], [0.27, 0.035, 0.46], c.sole),
      obj("box", "shoe @shoes", [0, -0.82, 0.03], [0.25, 0.1, 0.34], c.shoes),
      obj("sphere", "toe @shoes", [0, -0.835, 0.2], [0.125], c.shoes, { scale: [1, 0.62, 1.05] }),
      obj("box", "heel", [0, -0.835, -0.1], [0.22, 0.07, 0.1], c.sole),
    ]);
  };

  const arm = (side) => {
    const s = side < 0 ? "L" : "R";
    return group(`joint:arm${s}`, [side * 0.42, 1.52, 0], [
      obj("capsule", "sleeve @shirt", [0, -0.22, 0], [0.088, 0.5], c.shirt),
      obj("cylinder", "sleeve hem @shirt", [0, -0.43, 0], [0.095, 0.05], c.shirt, { material: { roughness: 0.9 } }),
      group(`joint:forearm${s}`, [0, -0.44, 0], [
        obj("capsule", "forearm @skin", [0, -0.17, 0], [0.068, 0.38], c.skin),
        obj("sphere", "palm @skin", [0, -0.36, 0.012], [0.078], c.skin, { scale: [1, 1.15, 0.72] }),
        obj("sphere", "thumb @skin", [-side * 0.058, -0.335, 0.045], [0.026], c.skin, { scale: [0.8, 1.6, 0.8], rot: [20, 0, side * 20] }),
        obj("capsule", "fingers @skin", [0, -0.43, 0.012], [0.045, 0.1], c.skin, { scale: [1.5, 1, 0.8] }),
      ]),
    ]);
  };

  // An eye is a group (only groups have children): white, pupil and a glint. The app blinks it by scaling the group.
  const eye = (side) => {
    const s = side < 0 ? "L" : "R";
    return group(`eye${s}`, [side * 0.1, 0.26, 0.23], [
      obj("sphere", `eye white ${s}`, [0, 0, 0], [0.052], c.white, { scale: [1, 1.1, 0.5], material: { roughness: 0.3 } }),
      obj("sphere", `pupil ${s}`, [0, 0, 0.026], [0.028], c.ink, { scale: [1, 1, 0.5], material: { roughness: 0.2 } }),
      obj("sphere", `glint ${s}`, [0.01, 0.014, 0.036], [0.008], "#ffffff", { material: { emissive: "#ffffff" } }),
    ]);
  };

  const head = group("joint:head", [0, 1.66, 0], [
    obj("sphere", "skull @skin", [0, 0.22, 0], [0.27], c.skin, { scale: [1, 1.07, 0.96] }),
    obj("sphere", "jaw @skin", [0, 0.1, 0.02], [0.2], c.skin, { scale: [1.05, 0.8, 0.95] }),
    obj("sphere", "ear L @skin", [-0.265, 0.2, 0], [0.055], c.skin, { scale: [0.6, 1, 1] }),
    obj("sphere", "ear R @skin", [0.265, 0.2, 0], [0.055], c.skin, { scale: [0.6, 1, 1] }),
    obj("sphere", "nose @skin", [0, 0.18, 0.268], [0.04], c.skin, { scale: [1, 1.1, 1.2] }),
    obj("sphere", "cheek L", [-0.15, 0.14, 0.225], [0.04], c.blush, { scale: [1, 0.7, 0.4], material: { roughness: 0.5, opacity: 0.55 } }),
    obj("sphere", "cheek R", [0.15, 0.14, 0.225], [0.04], c.blush, { scale: [1, 0.7, 0.4], material: { roughness: 0.5, opacity: 0.55 } }),
    eye(-1),
    eye(1),
    obj("box", "brow L @hair", [-0.1, 0.345, 0.235], [0.1, 0.022, 0.03], c.hair, { rot: [0, 0, 7] }),
    obj("box", "brow R @hair", [0.1, 0.345, 0.235], [0.1, 0.022, 0.03], c.hair, { rot: [0, 0, -7] }),
    obj("box", "mouth", [0, 0.095, 0.25], [0.085, 0.016, 0.03], c.lip),
    obj("sphere", "smile L", [-0.05, 0.105, 0.25], [0.012], c.lip),
    obj("sphere", "smile R", [0.05, 0.105, 0.25], [0.012], c.lip),
    // Hair: layered squashed spheres (a dome shape is on its way in Lite)
    obj("sphere", "hair top @hair", [0, 0.4, -0.05], [0.305], c.hair, { scale: [1, 0.56, 1.04] }),
    obj("sphere", "hair back @hair", [0, 0.27, -0.1], [0.265], c.hair, { scale: [1, 0.95, 0.85] }),
    obj("sphere", "hair fringe @hair", [0, 0.455, 0.15], [0.1], c.hair, { scale: [2.2, 0.45, 0.8], rot: [-12, 0, 0] }),
    obj("sphere", "sideburn L @hair", [-0.255, 0.22, 0.02], [0.06], c.hair, { scale: [0.6, 1.5, 1.1] }),
    obj("sphere", "sideburn R @hair", [0.255, 0.22, 0.02], [0.06], c.hair, { scale: [0.6, 1.5, 1.1] }),
  ]);

  const buttons = [0, 1, 2].map((i) => obj("sphere", `button ${i}`, [0, 1.42 - i * 0.14, 0.2], [0.018], c.white, { material: { roughness: 0.3 } }));
  const body = group("joint:body", [0, 0, 0], [
    leg(-1), leg(1),
    obj("sphere", "hips @pants", [0, 0.93, 0], [0.25], c.pants, { scale: [1, 0.62, 0.7] }),
    obj("cylinder", "belt", [0, 1.0, 0], [0.255, 0.045], c.belt, { scale: [1, 1, 0.68] }),
    obj("box", "buckle", [0, 1.0, 0.175], [0.06, 0.04, 0.012], c.gold, { material: { metalness: 0.6, roughness: 0.35 } }),
    obj("capsule", "torso @shirt", [0, 1.3, 0], [0.275, 0.7], c.shirt, { scale: [1, 1, 0.66] }),
    obj("sphere", "waist tuck @shirt", [0, 1.09, 0], [0.24], c.shirt, { scale: [1.05, 0.5, 0.7] }),
    obj("box", "collar L", [-0.07, 1.585, 0.115], [0.13, 0.04, 0.05], c.white, { rot: [0, 0, 28] }),
    obj("box", "collar R", [0.07, 1.585, 0.115], [0.13, 0.04, 0.05], c.white, { rot: [0, 0, -28] }),
    ...buttons,
    obj("box", "pocket @shirt", [0.15, 1.38, 0.2], [0.12, 0.12, 0.012], c.shirt, { material: { roughness: 0.95 } }),
    obj("sphere", "shoulder L @shirt", [-0.37, 1.52, 0], [0.1], c.shirt),
    obj("sphere", "shoulder R @shirt", [0.37, 1.52, 0], [0.1], c.shirt),
    obj("cylinder", "neck @skin", [0, 1.62, 0], [0.085, 0.14], c.skin),
    arm(-1), arm(1),
    head,
  ]);
  return [body];
}

/** Everything Lite needs to show it: the model, a floor, lights, a sky and a camera three-quarter on. */
export function characterScene(name = "Character base") {
  return {
    name,
    objects: [
      { id: "floor", kind: "plane", name: "Floor", pos: [0, 0, 0], rot: [-90, 0, 0], size: [10, 10], material: { color: "#414f72", roughness: 0.9 } },
      ...character(),
    ],
    lights: [
      { id: "sun", kind: "sun", color: "#fff1dc", intensity: 2.2, pos: [4, 7, 6], target: [0, 1, 0] },
      { id: "fill", kind: "ambient", color: "#cfd9ff", intensity: 0.9 },
    ],
    sky: { top: "#2a3350", bottom: "#46567a" },
    camera: { pos: [2.6, 1.5, 4.2], look: [0, 0.95, 0], fov: 30 },
  };
}
