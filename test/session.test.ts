import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieValue, safeEqual, sameOrigin, sessionCookie, signSession, siteDecision, verifySession } from "../worker/session.ts";

const NOW = 1_800_000_000_000;
const exp = Math.floor(NOW / 1000) + 100;

test("a signed session verifies; a wrong secret, an expired or a mangled one does not", async () => {
  const v = await signSession("pw", exp);
  assert.equal(await verifySession("pw", v, NOW), true);
  assert.equal(await verifySession("other", v, NOW), false);
  assert.equal(await verifySession("pw", v, NOW + 200_000), false);
  assert.equal(await verifySession("pw", v.slice(0, -1) + "0", NOW), false);
  assert.equal(await verifySession("pw", undefined, NOW), false);
  assert.equal(await verifySession("pw", "garbage", NOW), false);
});

test("cookieValue picks the named cookie", () => {
  assert.equal(cookieValue("a=1; miff_session=abc; b=2"), "abc");
  assert.equal(cookieValue("a=1"), undefined);
  assert.equal(cookieValue(null), undefined);
});

test("sessionCookie is HttpOnly and SameSite=Strict, Secure only on https", () => {
  assert.match(sessionCookie("v", 10, true), /HttpOnly; SameSite=Strict; Max-Age=10; Secure$/);
  assert.doesNotMatch(sessionCookie("v", 10, false), /Secure/);
});

test("the site gate serves the sign-in page to anyone and everything else only with a session", () => {
  assert.equal(siteDecision("GET", "/login", false), "serve");
  assert.equal(siteDecision("GET", "/", false), "redirect-login");
  assert.equal(siteDecision("GET", "/assets/index.js", false), "redirect-login");
  assert.equal(siteDecision("GET", "/", true), "serve");
  assert.equal(siteDecision("POST", "/", true), "not-found");
});

test("safeEqual and sameOrigin", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  const url = new URL("https://x.example/login");
  assert.equal(sameOrigin(null, url), true);
  assert.equal(sameOrigin("https://x.example", url), true);
  assert.equal(sameOrigin("https://evil.example", url), false);
});
