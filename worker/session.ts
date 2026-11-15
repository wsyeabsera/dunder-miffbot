// Page sessions, ported from lite (docs/auth.md there): a signed cookie, no server state.
// Value is `exp.hmac`, hmac = HMAC-SHA256(password, "miff-session:" + exp), so changing the password signs everyone out.
// Pure but for Web Crypto, which Workers and Node both have.

export const SESSION_COOKIE = "miff_session";
export const SESSION_SECONDS = 30 * 24 * 3600;
const enc = new TextEncoder();

/** Constant-time string comparison: the time taken does not depend on where the strings first differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function mac(secret: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`miff-session:${exp}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value of a session that ends at `exp` (seconds since 1970). */
export async function signSession(secret: string, exp: number): Promise<string> {
  return `${exp}.${await mac(secret, exp)}`;
}

/** True for a well-formed, unexpired value signed with this secret. */
export async function verifySession(secret: string, value: string | undefined, nowMs = Date.now()): Promise<boolean> {
  const m = value ? /^(\d{1,12})\.([0-9a-f]{64})$/.exec(value) : null;
  if (!m) return false;
  const exp = Number(m[1]);
  return exp > Math.floor(nowMs / 1000) && safeEqual(m[2], await mac(secret, exp));
}

/** One cookie's value from a `Cookie` header. */
export function cookieValue(header: string | null, name = SESSION_COOKIE): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** The Set-Cookie header: HttpOnly, SameSite=Strict, Secure on https. maxAge 0 clears it. */
export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export type SiteDecision = "serve" | "redirect-login" | "not-found";

/** Who may load the static files: a visitor without a session gets only the sign-in page; everything else redirects to it. */
export function siteDecision(method: string, pathname: string, authed: boolean): SiteDecision {
  if (method !== "GET" && method !== "HEAD") return "not-found";
  return authed || pathname === "/login" ? "serve" : "redirect-login";
}

/** A browser sends Origin on every POST: a cross-site one is refused. A request without Origin (a script) is let through; it has no ambient cookie. */
export const sameOrigin = (origin: string | null, url: URL): boolean => origin === null || origin === url.origin;
