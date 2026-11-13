import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// P5-033 part sms-ocr-14: scripts/start-paddle.cjs (run by `npm run dev`, which does not load .env) read .env for
// MANU_PADDLE_URL=off but not for AWS_STORE_DRY_RUN, so a test copy whose .env says AWS_STORE_DRY_RUN=1 still opened PaddleOCR; and it
// checked port 8867 whatever MANU_PADDLE_URL or MANU_PADDLE_PORT said, so anything on 8867 passed for PaddleOCR.
const req = createRequire(import.meta.url);
const { settings, parseEnv } = req(path.join(process.cwd(), "scripts", "start-paddle.cjs")) as {
  settings: (env: Record<string, string | undefined>, file: string) => { start: boolean; port?: number; why?: string };
  parseEnv: (t: string) => Record<string, string>;
};

describe("sms-ocr-14: start-paddle reads every setting the same way, environment then .env", () => {
  it("a test copy whose .env says AWS_STORE_DRY_RUN=1 is left alone", () => {
    expect(settings({}, "AWS_STORE_DRY_RUN=1\n").start).toBe(false);
    expect(settings({}, 'AWS_STORE_DRY_RUN="1"\r\nOTHER=x').start).toBe(false);
    expect(settings({ AWS_STORE_DRY_RUN: "1" }, "").start).toBe(false);
  });

  it("MANU_PADDLE_URL=off, from either place, is left alone", () => {
    expect(settings({}, "MANU_PADDLE_URL=off").start).toBe(false);
    expect(settings({ MANU_PADDLE_URL: "OFF" }, "").start).toBe(false);
  });

  // Changed by reviewerB-02: MANU_PADDLE_PORT is no longer a source, since the app never reads it (the server moved away from the app).
  it("the port is the one the app will call: MANU_PADDLE_URL's, else 8867", () => {
    expect(settings({}, "")).toEqual({ start: true, port: 8867 });
    expect(settings({}, "MANU_PADDLE_PORT=9011")).toEqual({ start: true, port: 8867 });
    expect(settings({}, "MANU_PADDLE_URL=http://127.0.0.1:9022")).toEqual({ start: true, port: 9022 });
    expect(settings({ MANU_PADDLE_URL: "http://localhost:9033/" }, "MANU_PADDLE_URL=http://127.0.0.1:9022")).toEqual({ start: true, port: 9033 });
  });

  it("a PaddleOCR on another computer is not started here", () => {
    expect(settings({}, "MANU_PADDLE_URL=http://10.0.0.5:8867").start).toBe(false);
    expect(settings({}, "MANU_PADDLE_URL=not a url").start).toBe(false);
  });

  it("parseEnv: quotes, comments and export lines", () => {
    expect(parseEnv('# c\nexport A=1\nB = "two words"\nC=x # note\n\nD=')).toEqual({ A: "1", B: "two words", C: "x", D: "" });
  });
});
