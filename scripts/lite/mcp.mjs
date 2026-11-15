// Minimal JSON-RPC client for Lite's HTTP MCP. Token comes from the environment and is never printed.
const URL = "http://127.0.0.1:8790/mcp";
let sid;
let id = 0;
async function rpc(method, params) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(process.env.LITE_TOKEN ? { Authorization: `Bearer ${process.env.LITE_TOKEN}` } : {}), ...(sid ? { "Mcp-Session-Id": sid } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  sid ||= res.headers.get("mcp-session-id") ?? undefined;
  const text = await res.text();
  const m = /data: (.*)/.exec(text);
  return JSON.parse(m ? m[1] : text);
}
export async function init() {
  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "dunder-miffbot", version: "0" } });
}
export async function call(name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.error) throw new Error(JSON.stringify(r.error));
  const t = r.result?.content?.map((c) => c.text).join("\n") ?? "";
  if (r.result?.isError) throw new Error(t);
  return t;
}
export async function tools() {
  return (await rpc("tools/list", {})).result.tools;
}
