// Copy to: chennai-grievance-portal-main/src/lib/paddle-start.probe.fixall.test.ts (next to paddle-start.fixall.test.ts)
//
// reviewerB-02 (P5-033 part sms-ocr-14, commit 63cfd444). settings() in scripts/start-paddle.cjs:45 takes MANU_PADDLE_PORT as "the
// port the app will call" when MANU_PADDLE_URL is empty, and main() now starts server.py with that port (start-paddle.cjs:75). But the
// app never reads MANU_PADDLE_PORT: src/lib/manu/paddle.ts baseUrl() calls MANU_PADDLE_URL or http://127.0.0.1:8867. Before 63cfd444 a
// MANU_PADDLE_PORT in .env did nothing (server.py does not read .env), so server and app both used 8867. Now the server moves to
// that port and the app keeps calling 8867: the PaddleOCR step is skipped on every petition, with only a console warning.
//
// reviewerB-03 (same commit). parseEnv strips quotes only when the whole value is quoted, so `AWS_STORE_DRY_RUN="1" # a test copy`
// reads as `"1"` (quotes kept) and the test copy starts PaddleOCR, the case sms-ocr-14 was about. Next's dotenv reads it as 1.
//
// Expected on 172fabd: both tests fail.
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const req = createRequire(import.meta.url);
const { settings } = req(path.join(process.cwd(), "scripts", "start-paddle.cjs")) as {
  settings: (env: Record<string, string | undefined>, file: string) => { start: boolean; port?: number; why?: string };
};

const KEYS = ["MANU_PADDLE_URL", "MANU_PADDLE_PORT"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The address src/lib/manu/paddle.ts calls with this environment (Next loads .env into process.env for the app). */
async function appCalls(env: Partial<Record<(typeof KEYS)[number], string>>): Promise<URL> {
  for (const k of KEYS) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  let seen = "";
  vi.stubGlobal("fetch", vi.fn(async (u: unknown) => { seen = String(u); throw new Error("probe: no server"); }));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const { paddleRead } = await import("@/lib/manu/paddle");
  await paddleRead([{ data: Buffer.from("x").toString("base64") }]);
  expect(seen, "paddleRead called the service").not.toBe("");
  return new URL(seen);
}

describe("reviewerB-02: start-paddle starts the server on the port the app calls", () => {
  it("MANU_PADDLE_PORT=9011 and no MANU_PADDLE_URL (as .env gives both to the app and to start-paddle)", async () => {
    const called = await appCalls({ MANU_PADDLE_PORT: "9011" });
    const s = settings({}, "MANU_PADDLE_PORT=9011\n");
    expect(s.start).toBe(true);
    expect(s.port, `the app calls ${called.href}`).toBe(Number(called.port || 80));
  });
});

describe("reviewerB-03: a test copy's .env is read the way the app reads it", () => {
  it('AWS_STORE_DRY_RUN="1" with a comment after it is a test copy', () => {
    expect(settings({}, 'AWS_STORE_DRY_RUN="1"   # a test copy\n').start).toBe(false);
  });
});
