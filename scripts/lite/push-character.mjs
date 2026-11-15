// Sends the base character to Lite (project `dunder-miffbot`, scene `character-base`) and prints Lite's own review.
import { init, call } from "./mcp.mjs";
import { characterScene } from "./character.mjs";

const PROJECT = "dunder-miffbot";
const SCENE = "character-base";
await init();
const known = JSON.parse(await call("list_projects")).projects.map((p) => p.id);
if (!known.includes(PROJECT)) {
  await call("open_project", { id: PROJECT, name: "Dunder Miffbot", kind: "web", manifest: { tree: ["src/", "docs/", "worker/", "scripts/lite/", "package.json"], files: { "README": "Dunder Miffbot: a 3D office of AI employees. Characters and props are designed in Lite scenes (docs/lite-asset-format.md)." } } });
}
const scenes = JSON.parse(await call("list_scenes", { project: PROJECT })).scenes.map((s) => s.id);
if (!scenes.includes(SCENE)) await call("create_scene", { project: PROJECT, name: "Character base", id: SCENE });
await call("set_scene", { project: PROJECT, scene: SCENE, data: characterScene() });
console.log(await call("validate_scene", { project: PROJECT, scene: SCENE }));
const review = JSON.parse(await call("review_scene", { project: PROJECT, scene: SCENE }));
console.log("review:", JSON.stringify({ score: review.score, ok: review.ok, stats: review.stats, issues: review.issues.slice(0, 6) }));
console.log(`open: http://127.0.0.1:8790/#/project/${PROJECT}/scene/${SCENE}`);
