// QA pass 4: the security scans' findings as tests. See docs/qa/pass4/findings/scans-security.json.
// Run: npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/scan-findings.test.ts
// A bug still open is it.fails(...) and its name starts with the finding id; the fixer changes it to it(...).
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodType } from "zod";

vi.mock("@/lib/ai/gateway", () => ({ generateJson: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: vi.fn(async () => ({ userId: 1, email: "nobody@example.invalid", role: "citizen" })) }));
vi.mock("@/lib/db", () => ({ default: { query: vi.fn(async () => [[]]) } }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn(async () => {}), otpEmailHtml: () => "" }));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const post = (url: string, body: string) => new NextRequest(`http://127.0.0.1${url}`, { method: "POST", body, headers: { "content-type": "application/json" } });

describe("open findings", () => {
  // The real run that crashed the server is in docs/qa/pass4/evidence/scans/runtime-prod-zod-probe.json. Here, the cause: zod makes one issue object per bad
  // element, even with .max(80) on the array, and nothing refuses the body before that. 300,000 elements is 0.6 MB of request.
  it("SCAN-1 a request to /api/i18n cannot make the server build one error object per array element", async () => {
    const spy = vi.spyOn(ZodType.prototype, "safeParse");
    vi.resetModules();
    const { POST } = await import("@/app/api/i18n/route");
    const res = await POST(post("/api/i18n", `{"lang":"ta","texts":[${"0,".repeat(299_999)}0]}`));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const issues = spy.mock.results.map((r) => (r.value as { error?: { issues?: unknown[] } } | undefined)?.error?.issues?.length ?? 0);
    expect(Math.max(0, ...issues)).toBeLessThan(1000);
  });

  it("SCAN-6 a malformed body on the mobile code request is a 400, as the route's own comment says, not a 500", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/profile/mobile-otp/request/route");
    const res = await POST(post("/api/profile/mobile-otp/request", "{not json"));
    expect(res.status).toBe(400);
  });

  // Semgrep's gcm-no-tag-length on src/lib/crypto.ts:23. A 4-byte tag on an empty message is accepted, because the expected length is not given to createDecipheriv.
  it("SCAN-5 decryption refuses an authentication tag shorter than the 16 bytes encryption writes", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const whole = Buffer.from(encryptSecret(""), "base64");
    const short = Buffer.concat([whole.subarray(0, 12), whole.subarray(12, 16)]).toString("base64");
    expect(() => decryptSecret(short)).toThrow();
  });

  // src/lib/secrets.ts only looks at the length. The placeholder in the public repo's .env.example is long enough, so a server started from a plain copy signs tokens with a known key.
  it("SCAN-8 production refuses the JWT_SECRET placeholder that .env.example carries", async () => {
    const line = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", ".env.example"), "utf8").match(/^JWT_SECRET=(.*)$/m)?.[1] ?? "";
    const placeholder = line.trim().replace(/^["']|["']$/g, "");
    expect(placeholder.length).toBeGreaterThanOrEqual(32);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", placeholder);
    const { jwtSecret } = await import("@/lib/secrets");
    expect(() => jwtSecret()).toThrow();
  });
});

describe("checked and sound: keep it that way", () => {
  const local = { get: (n: string) => ({ host: "127.0.0.1:3000" } as Record<string, string>)[n.toLowerCase()] ?? null };
  it("a sign-in code is echoed only when both the flag is on and the server is not production", async () => {
    const { devOtpForResponse } = await import("@/lib/otp");
    vi.stubEnv("NEXT_PUBLIC_DEV_SHOW_OTP", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(devOtpForResponse("123456", local)).toBeUndefined();
    vi.stubEnv("NODE_ENV", "development"); // this branch is why SCAN-4 exists: a dev server with the .env flag gave the code to whoever asked
    expect(devOtpForResponse("123456", local)).toBe("123456");
    vi.stubEnv("NEXT_PUBLIC_DEV_SHOW_OTP", "false");
    expect(devOtpForResponse("123456", local)).toBeUndefined();
  });

  // SCAN-4 (PB-220): even on a dev server with the flag on, a request that did not come from this PC never gets the code
  it.each([
    ["a tunnel's host", { host: "abc.trycloudflare.com" }],
    ["forwarded for a stranger", { host: "127.0.0.1:3000", "x-forwarded-for": "203.0.113.9" }],
    ["a stranger behind a proxy that appends this PC", { host: "localhost:3000", "x-forwarded-for": "203.0.113.9, 127.0.0.1" }],
    ["cloudflare's header", { host: "localhost:3000", "cf-connecting-ip": "203.0.113.9" }],
    ["a forwarded host that is not local", { host: "localhost:3000", "x-forwarded-host": "abc.trycloudflare.com" }],
    ["the Forwarded header", { host: "localhost:3000", forwarded: "for=203.0.113.9;proto=https" }]
  ])("SCAN-4 no code on a dev server for %s", async (_n, h) => {
    const { devOtpForResponse } = await import("@/lib/otp");
    vi.stubEnv("NEXT_PUBLIC_DEV_SHOW_OTP", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(devOtpForResponse("123456", { get: (n: string) => (h as Record<string, string>)[n.toLowerCase()] ?? null })).toBeUndefined();
  });

  it("the production build compiled the code helper away and carries no trace of the flag", () => {
    const root = path.resolve(__dirname, "..", "..", "..", ".next-qa");
    const route = path.join(root, "server", "app", "api", "auth", "forgot-password", "request-otp", "route.js");
    if (!fs.existsSync(route)) return; // no build on this machine: nothing to check
    const js = fs.readFileSync(route, "utf8");
    // The minified names change with every build and every Next version (Next 14: `GP:()=>q`, Next 15: `v8:()=>o`), so they are read from the route itself:
    // the call that makes the reset reply's devOtp takes (otp, headers); its export names the helper; the helper must return nothing.
    // Fix-all round 2 (hunt2-sec-06) made the route wait for the code only when devOtpShown(headers) says so, and pass the awaited code as a
    // plain value (`(0,z.v8)(b,a.headers)`, no longer `c.otp`): so the code helper's call takes a value or an `.otp`, and the gate, the same
    // module's one-argument helper on the headers, must compile to `return false`.
    const call = js.match(/\(0,(\w+)\.(\w+)\)\(\w+(?:\.otp)?,\w+\.headers\)/);
    const exported = call?.[2];
    expect(exported, "the call of the dev-code helper").toBeTruthy();
    const helperOf = (name: string) => js.match(new RegExp(String.raw`[^\w]` + name + String.raw`:\(\)=>(\w+)`))?.[1];
    const helper = helperOf(exported!);
    expect(helper, "the helper behind that export").toBeTruthy();
    // an empty body, or one that returns nothing (`{}`, `{0}`, `{return}`, `{return void 0}`)
    expect(js).toMatch(new RegExp("function " + helper + String.raw`\([\w,]*\)\{(?:0|void 0|return(?: void 0)?;?)?\}`));
    const gate = js.match(new RegExp(String.raw`\(0,` + call![1] + String.raw`\.(\w+)\)\(\w+\.headers\)`))?.[1];
    expect(gate, "the call of the dev-code gate (devOtpShown) beside it").toBeTruthy();
    expect(js).toMatch(new RegExp("function " + helperOf(gate!) + String.raw`\([\w,]*\)\{return!1\}`));
    expect(js).not.toContain("DEV_SHOW_OTP");
  });

  it("the Markdown renderer behind every dangerouslySetInnerHTML with text in it escapes that text first", async () => {
    const { mdToHtml } = await import("@/lib/markdown");
    for (const bad of ["<img src=x onerror=alert(1)>", "**<script>alert(1)</script>**", "# <svg onload=alert(1)>", "- `<iframe src=javascript:alert(1)>`", "1. _<b onclick=x>_"]) {
      const html = mdToHtml(bad);
      expect(html).not.toMatch(/<(img|script|svg|iframe)\b/i);
      expect(html).not.toMatch(/<b onclick/i);
    }
  });
});
