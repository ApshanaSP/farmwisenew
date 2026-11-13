/**
 * Reviewer 2 probe (QA pass 7, studio-parse), kept as a regression test: readFacts answered "none of these" whenever the reader refused
 * or stopped the facts job, so a CAPTCHA wall or a sign-in page fetched while the Studio was busy was reported as a page with no data.
 * Fixed (p7-studio-parse-11): a busy reader is thrown as busy and resolveLink makes it an outcome; only a stopped job answers "none".
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer2/facts.test.ts < /dev/null
 */
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ url: "https://example.org/wards", html: "" }));
vi.mock("@/lib/studio/fetchurl", async (orig) => {
  const m = await orig<typeof import("@/lib/studio/fetchurl")>();
  return { ...m, fetchOnce: vi.fn(async (u: string) => {
    if (u === h.url) return { buf: Buffer.from(h.html), name: "wards.html", contentType: "text/html", url: h.url, status: 200 };
    throw new m.LinkError("The link answered 404.", "http", 404);
  }) };
});
vi.mock("@/lib/studio/connect/robots", () => ({ robotsAllow: async () => true }));

import { resolveLink } from "@/lib/studio/connect/resolve";
import { pageFacts } from "@/lib/studio/connect/links";
import { ParseLimitError, readFacts, readerState, stopReaders } from "@/lib/studio/parse-pool";

const CAPTCHA = `<!doctype html><html><head><title>Just a moment...</title></head><body><div class="cf-turnstile" data-sitekey="x"></div><p>Checking your browser before accessing the ward register.</p><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"></script></body></html>`;
const caught = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

it("readFacts on a CAPTCHA wall while 24 other jobs wait: the real facts, or busy, never 'not a CAPTCHA'", async () => {
  stopReaders();
  // 24 pages waiting (the default queue): a few Collectors pasting links at once
  const waiting = Array.from({ length: 24 }, () => caught(readFacts("<html><title>x</title></html>")));
  const f = await readFacts(CAPTCHA).then((v) => v, (e: Error) => e);
  console.log("facts while busy:", f instanceof Error ? f.message : f, "in-thread:", pageFacts(CAPTCHA), readerState());
  await Promise.all(waiting);
  if (f instanceof Error) expect((f as ParseLimitError).reason).toBe("busy");
  else expect(f.captcha).toBe(pageFacts(CAPTCHA).captcha);
}, 120_000);

it("resolveLink on that CAPTCHA wall while the queue is full: the outcome", async () => {
  stopReaders();
  vi.stubEnv("STUDIO_BROWSER", "0");
  h.html = CAPTCHA;
  const calm = await resolveLink(h.url, { mode: "none" } as never, { log: () => {}, explore: false });
  stopReaders();
  const waiting = Array.from({ length: 24 }, () => caught(readFacts("<html><title>x</title></html>")));
  const busy = await resolveLink(h.url, { mode: "none" } as never, { log: () => {}, explore: false });
  await Promise.all(waiting);
  console.log("calm:", { kind: calm.outcome.kind, reason: calm.outcome.reason, why: calm.outcome.why });
  console.log("busy:", { kind: busy.outcome.kind, reason: busy.outcome.reason, why: busy.outcome.why });
  expect(calm.outcome.reason).toBe("captcha");
  // the same CAPTCHA answer, or "busy, try again": never "no data here"
  expect(busy.outcome.kind).not.toBe("nodata");
  if (busy.outcome.reason !== calm.outcome.reason) expect(busy.outcome.why).toMatch(/reading many files/);
}, 120_000);

it("the CAPTCHA wall pasted while the only reader is held and the queue is full: told the Studio is busy, never 'no data here'", async () => {
  stopReaders();
  vi.stubEnv("STUDIO_BROWSER", "0"); vi.stubEnv("STUDIO_PARSE_PROCS", "1"); vi.stubEnv("STUDIO_PARSE_QUEUE", "1"); vi.stubEnv("STUDIO_PARSE_SECONDS", "4");
  h.html = CAPTCHA;
  const { parseAllAsync } = await import("@/lib/studio/parse");
  const { slowKml } = await import("../files");
  const hold = caught(parseAllAsync(slowKml(), "held.kml"));
  for (let i = 0; i < 200 && !readerState().procs.some((p) => p.busy); i++) await new Promise((r) => setTimeout(r, 25));
  const waiting = caught(readFacts("<html><title>x</title></html>"));
  const r = await resolveLink(h.url, { mode: "none" } as never, { log: () => {}, explore: false });
  console.log("held + full:", { kind: r.outcome.kind, reason: r.outcome.reason, why: r.outcome.why });
  await Promise.all([hold, waiting]);
  expect(r.outcome.kind).toBe("error");
  expect(r.outcome.why).toMatch(/reading many files/);
}, 60_000);
