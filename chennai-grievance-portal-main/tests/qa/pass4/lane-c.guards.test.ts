// QA pass 4, lane c: class guards. Each one fails if its kind of bug comes back anywhere in the code.
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const routes = walk(path.join(ROOT, "src/app/api")).filter((f) => /route\.ts$/.test(f));
const SIGNED = /getSession|getActivePortalSession|getActiveSession|collectorSession|assistantSession|officerSession|requireRole|localOnly|allowed\(req\)/;

describe("RC-17 class guard: no route without a sign-in reads its body unbounded", () => {
  it("every route that checks no session reads JSON through readJsonCapped", () => {
    const bad = routes.filter((f) => {
      const s = fs.readFileSync(f, "utf8");
      return !SIGNED.test(s) && /\b(req|request)\.(json|text|formData|arrayBuffer)\(\)/.test(s) && !/readJsonCapped/.test(s);
    }).map((f) => path.relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});

describe("RC-17 readJsonCapped", () => {
  it("refuses a chunked body past the limit even with no Content-Length, and a small body still parses", async () => {
    const { readJsonCapped } = await import("@/lib/body-cap");
    const big = new Request("http://127.0.0.1/x", { method: "POST", body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("[" + "0,".repeat(40_000) + "0]")); c.close(); } }), duplex: "half" } as RequestInit);
    expect((await readJsonCapped(big, 64 * 1024)).tooLarge).toBe(true);
    const ok = new Request("http://127.0.0.1/x", { method: "POST", body: '{"a":1}' });
    expect(await readJsonCapped(ok)).toEqual({ body: { a: 1 }, tooLarge: false });
    const bad = new Request("http://127.0.0.1/x", { method: "POST", body: "{nope" });
    expect(await readJsonCapped(bad)).toEqual({ body: null, tooLarge: false });
  });
});

// ---------------------------------------------------------------------------------------------------------------- RC-23
describe("RC-23 class guard: a bad body or a Tamil word is a 400 or an answer, never a throw", () => {
  it("every route that reads a form does it behind a catch", () => {
    const bad = routes.filter((f) => {
      const s = fs.readFileSync(f, "utf8");
      const reads = [...s.matchAll(/\.formData\(\)/g)];
      if (!reads.length) return false;
      return reads.some((m) => { const around = s.slice(Math.max(0, m.index! - 80), m.index! + 60); return !/catch|try\s*\{/.test(around) && !/try\s*\{/.test(s.slice(0, m.index!).split("\n").slice(-3).join("\n")); });
    }).map((f) => path.relative(ROOT, f));
    // rehearsal/dev reads its form inside one try for the whole handler (a dev-only route)
    expect(bad.filter((f) => !/rehearsal[\/]dev/.test(f))).toEqual([]);
  });
  it("no route reads a field of a body it read with .catch(() => null) without a null check", () => {
    const bad: string[] = [];
    for (const f of routes) {
      const lines = fs.readFileSync(f, "utf8").split("\n");
      lines.forEach((l, i) => {
        const m = l.match(/const (\w+) = await (?:req|request)\.json\(\)\.catch\(\(\) => null\)/);
        if (!m) return;
        const v = m[1];
        // the first use must be guarded: v?.x, v && ..., !v, v ?? ..., or a schema parse of v itself
        const next = lines.slice(i + 1, i + 8).find((x) => new RegExp(String.raw`\b${v}\b`).test(x)) ?? "";
        if (new RegExp(String.raw`\b${v}\.[A-Za-z]|\b${v}\[`).test(next) && !new RegExp(String.raw`${v}\?\.|${v}\s*&&|!${v}\b|${v}\s*\?\?|${v}\s*\|\|`).test(next)) bad.push(`${path.relative(ROOT, f)}:${i + 2}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("every rehearsal route says 404 for what is not in the record and 503 only for an unavailable service", async () => {
    const { RehearsalNotFound, RehearsalUnavailable } = await import("@/lib/rehearsal/engine");
    expect(new RehearsalNotFound("x").status).toBe(404);
    expect(new RehearsalUnavailable("x").status).toBe(503);
    expect(new RehearsalNotFound("x")).toBeInstanceOf(RehearsalUnavailable);
    const hard = routes.filter((f) => /api[\/]rehearsal/.test(f)).filter((f) => /RehearsalUnavailable\) return NextResponse\.json\([^)]*status: 503/.test(fs.readFileSync(f, "utf8")));
    expect(hard.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe("RC-23 searchGroups: a Tamil word is a word", () => {
  it.each(["குப்பை", "சாலை", "புகார்", "குடிநீர்", "தீ", "நோய்", "கொசு", "பேருந்து", "மழை", "வெள்ளம் அடையாறு"])("%s makes at least one group", async (w) => {
    const { searchGroups } = await import("@/lib/collector/searchwords");
    expect(searchGroups(w).length).toBeGreaterThan(0);
    expect(searchGroups(w)[0].includes(w.split(" ")[0])).toBe(true);
  });
  it("any text with a letter in it makes a group, in any script, so the SQL built from it is never empty", async () => {
    const { searchGroups } = await import("@/lib/collector/searchwords");
    const fc = await import("fast-check");
    fc.assert(fc.property(fc.string({ unit: "grapheme", minLength: 1, maxLength: 30 }), (s) => {
      const hasLetter = /[\p{L}\p{N}]/u.test(s);
      const g = searchGroups(s);
      return hasLetter ? g.length > 0 && g.every((x) => x.length > 0) : true;
    }), { numRuns: 400 });
  });
});

describe("RC-23 routes: a request that is not what the route reads", () => {
  it("the photo route gets a 400 for a request that is not multipart", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 1, email: "a@example.invalid", role: "citizen" }) }));
    vi.doMock("@/lib/db", () => ({ default: { query: async () => [[]] } }));
    const { POST } = await import("@/app/api/profile/photo/route");
    const res = await POST(new NextRequest("http://127.0.0.1/api/profile/photo", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
  it.each(["request", "verify"])("mobile-otp %s gets a 400 for a body that is not JSON", async (which) => {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 1, email: "a@example.invalid", role: "citizen" }) }));
    vi.doMock("@/lib/db", () => ({ default: { query: async () => [[]] } }));
    vi.doMock("@/lib/mailer", () => ({ sendMail: async () => {}, otpEmailHtml: () => "" }));
    const { POST } = await import(`@/app/api/profile/mobile-otp/${which}/route`);
    const res = await POST(new NextRequest(`http://127.0.0.1/api/profile/mobile-otp/${which}`, { method: "POST", body: "{not json", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------- RC-24
describe("RC-24 class guard: a row id is read by one rule that agrees with how the store numbers rows", () => {
  it("parseStoreId takes every id a copy that does not save can make (from LOCAL_IDS up) and refuses what is not an id", async () => {
    const { parseStoreId } = await import("@/lib/store-id");
    const store = fs.readFileSync(path.join(ROOT, "src/lib/aws/store.ts"), "utf8");
    const local = Number(store.match(/LOCAL_IDS\s*=\s*([\d_]+)/)![1].replace(/_/g, ""));
    for (const n of [1, 801, 999_999_999, local, local + 1, local + 3, local + 5_000_000]) expect(parseStoreId(String(n)), String(n)).toBe(n);
    for (const bad of ["0", "-1", "1.5", "abc", "", "00000000001x", "99999999999", "2147483648", " 5", "5 "]) expect(parseStoreId(bad), JSON.stringify(bad)).toBeNull();
  });
  it("no [id] route limits an id by its number of digits", () => {
    const bad = routes.filter((f) => /\[id\]/.test(f)).filter((f) => /\^\x5cd\{1,\d\}\$/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------- RC-25
describe("RC-25 class guard: routes that hand out the console's data go through the step-up, and no code is echoed without asking where from", () => {
  it("every route that serves a CSV of incidents calls requireConfirm", () => {
    const csv = routes.filter((f) => /csvCell/.test(fs.readFileSync(f, "utf8")) && /text\/csv|csv/.test(fs.readFileSync(f, "utf8")));
    expect(csv.length).toBeGreaterThanOrEqual(2);
    const bad = csv.filter((f) => !/requireConfirm/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(bad).toEqual([]);
  });
  it("every route that echoes a dev code passes the request's headers to devOtpForResponse", () => {
    const bad = routes.filter((f) => /devOtpForResponse\(/.test(fs.readFileSync(f, "utf8")) && !/devOtpForResponse\([^)]*headers/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(bad).toEqual([]);
  });
  it("the assistant's CSV link is fetched, so the console's confirm box can answer a 428 (a plain link cannot send the grant)", () => {
    const card = fs.readFileSync(path.join(ROOT, "src/components/collector/app/assistant/AnswerCard.tsx"), "utf8");
    expect(card).not.toMatch(/<a className="aq-dl" href=\{card\.download\.href\} download>/);
  });
  it("a secret that is a phrase of words, or says change/replace/your, is not a secret in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { strongSecret } = await import("@/lib/secrets");
    for (const weak of ["replace_this_with_a_long_random_secret_string", "change-me-to-a-long-random-text", "your secret goes here please", "dev_only_insecure_secret_change_me", "this-is-my-jwt-secret-for-the-server"]) expect(() => strongSecret("X", weak, "d"), weak).toThrow();
    for (const good of ["3f9a1c7e0b5d48a2916e7c3d5b8f0a42e1d6c9b7a4f3e2d1c0b9a8f7e6d5c4b3", "q8Zk2VxJp0LmN4rTbW7yHcUe5SgAo1DfIu3Xv6Rj9Kw=", "xK9-pQ2_vL7mZt4-Yb8nWc3_Rd6-aH5jE1"]) expect(strongSecret("X", good, "d")).toBe(good);
    vi.unstubAllEnvs();
  });
  it("the real .env's secret, if there is one, is not mistaken for a placeholder", async () => {
    const env = path.join(ROOT, ".env");
    if (!fs.existsSync(env)) return;
    const v = fs.readFileSync(env, "utf8").match(/^JWT_SECRET=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (!v) return;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { strongSecret } = await import("@/lib/secrets");
    expect(() => strongSecret("JWT_SECRET", v, "d")).not.toThrow();
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------------------------------------------- RC-22
describe("RC-22 class guard: the framework is on a release that has the Windows RCE fix, and the code reads request state the way that release wants", () => {
  it("next is 15.5.24 or later (GHSA-p293-qw3h-jr36 is fixed from there; Next 14 has no patched release)", () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/next/package.json"), "utf8")).version as string;
    const [a, b, c] = v.split(".").map((x) => parseInt(x, 10));
    expect(a > 15 || (a === 15 && (b > 5 || (b === 5 && c >= 24))), v).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).dependencies.next).toMatch(/^\^?(1[5-9]|[2-9]\d)\./);
  });
  it("cookies(), headers() and a route's params are always awaited", () => {
    const files = walk(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const bad: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      if (/\b(?<!await )(?<![.\w])(cookies|headers)\(\)\.(get|getAll|has)\b/.test(s) && /from "next\/headers"/.test(s)) bad.push(path.relative(ROOT, f));
      if (/\{ params \}: \{ params: \{/.test(s)) bad.push(`${path.relative(ROOT, f)} (params not a Promise)`);
    }
    expect(bad).toEqual([]);
  });
});
