// Saves a Lite scene's objects as src/assets/<scene>.lite.json, the file the app loads (src/lite-model.ts).
// Usage: node scripts/lite/pull.mjs [scene] (default character-base)
import { writeFileSync } from "node:fs";
import { init, call } from "./mcp.mjs";

const PROJECT = "dunder-miffbot";
const scene = process.argv[2] ?? "character-base";
await init();
const data = JSON.parse(await call("read_scene", { project: PROJECT, scene }));
// The preview floor is only there so Lite has something to stand the model on.
const objects = (data.scene ?? data).objects?.filter((o) => o.id !== "floor");
if (!Array.isArray(objects)) throw new Error("no objects in " + scene);
writeFileSync(new URL(`../../src/assets/${scene}.lite.json`, import.meta.url), JSON.stringify(objects, null, 1) + "\n");
console.log(`saved ${objects.length} top-level objects from ${scene}`);
