// The Worker runs before the static files (assets.run_worker_first in wrangler.jsonc) so nobody sees the office without a session.
// One person, the owner: no accounts. The password is the secret MIFF_PASSWORD; unset, everything fails closed.
import { SESSION_SECONDS, cookieValue, safeEqual, sameOrigin, sessionCookie, siteDecision, signSession, verifySession } from "./session.ts";

export type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  LOGIN_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  MIFF_PASSWORD?: string;
};

const BODY_MAX = 1024;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

async function login(request: Request, env: Env, password: string): Promise<Response> {
  const url = new URL(request.url);
  if (!sameOrigin(request.headers.get("Origin"), url)) return json(403, { error: "cross-site request refused" });
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await env.LOGIN_LIMIT.limit({ key })).success) return json(429, { error: "Too many tries" }, { "Retry-After": "60" });
  const text = await request.text();
  let supplied: unknown;
  try {
    supplied = text.length <= BODY_MAX ? JSON.parse(text)?.password : undefined;
  } catch {
    /* falls through to the 400 below */
  }
  if (typeof supplied !== "string") return json(400, { error: 'expected {"password": "..."}' });
  if (!safeEqual(supplied, password)) return json(401, { error: "Wrong password" });
  const value = await signSession(password, Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return json(200, { ok: true }, { "Set-Cookie": sessionCookie(value, SESSION_SECONDS, url.protocol === "https:") });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const password = env.MIFF_PASSWORD;
    if (!password) return new Response("Login is not configured. Set the MIFF_PASSWORD secret.", { status: 503 });
    const url = new URL(request.url);

    if (request.method === "POST" && (url.pathname === "/login" || url.pathname === "/logout")) {
      if (url.pathname === "/login") return login(request, env, password);
      if (!sameOrigin(request.headers.get("Origin"), url)) return json(403, { error: "cross-site request refused" });
      return json(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0, url.protocol === "https:") });
    }

    const authed = await verifySession(password, cookieValue(request.headers.get("Cookie")));
    switch (siteDecision(request.method, url.pathname, authed)) {
      case "not-found":
        return new Response("Not found", { status: 404 });
      case "redirect-login":
        return Response.redirect(new URL("/login", url).toString(), 302);
      case "serve": {
        const asset = await env.ASSETS.fetch(request);
        const res = new Response(asset.body, asset);
        res.headers.set("Cache-Control", "private, no-cache");
        return res;
      }
    }
  },
};
