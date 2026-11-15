// Keeps only the animation clips the app uses, so the files shipped to the browser are small.
// Usage: node scripts/trim-animations.mjs <original UAL1_Standard.glb> <original UAL2_Standard.glb>
// The originals (Quaternius, CC0) are not kept in the repo; download them from quaternius.itch.io (Universal Animation Library 1 and 2, Standard).
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";
import { basename } from "node:path";

const USED = new Set(["Walk_Formal_Loop", "Walk_Loop", "Idle_Loop", "Idle_FoldArms_Loop", "Idle_Talking_Loop", "Idle_TalkingPhone_Loop", "Idle_No_Loop", "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Consume", "Interact"]);
const io = new NodeIO();
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  let kept = 0;
  for (const anim of root.listAnimations()) {
    if (USED.has(anim.getName())) kept++;
    else {
      // The clip's channels and samplers hold the keyframe data: dispose them too, or the data stays in the file
      anim.listChannels().forEach((c) => c.dispose());
      anim.listSamplers().forEach((x) => x.dispose());
      anim.dispose();
    }
  }
  // Only the animation data matters here (clips bind to bones by name), so drop the mannequin mesh, skin and textures too.
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  await doc.transform(prune());
  const out = new URL("../public/assets/characters/" + basename(file), import.meta.url);
  await io.write(out.pathname, doc);
  console.log(basename(file) + ": kept " + kept + " clips");
}
