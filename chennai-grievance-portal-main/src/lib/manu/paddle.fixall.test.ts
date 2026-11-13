import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupReading, paddleRead } from "./paddle";

// P5-033's PaddleOCR parts. sms-ocr-13: MANU_PADDLE_URL was not held to this computer, so the petition photos (names, phones, Aadhaar)
// could be posted to any host over plain http. sms-ocr-12: an answer of any size was taken whole, and with the AI OCR off its text became
// full_text past the 30 000 characters the approval accepts (approve then failed with zod's message naming no field).
const pages = [{ data: Buffer.from("one").toString("base64") }];
beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("sms-ocr-13: the PaddleOCR service is this computer's own", () => {
  it.each(["http://ocr.example.org:8867", "http://10.0.0.5:8867", "https://paddle.test", "http://127.0.0.1.nip.io:8867", "ftp://127.0.0.1:8867", "not a url"])("%s is not asked", async (url) => {
    vi.stubEnv("MANU_PADDLE_URL", url);
    const f = vi.fn(async () => new Response(JSON.stringify({ lines: [] })));
    vi.stubGlobal("fetch", f);
    expect(await paddleRead(pages)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it.each(["", "http://127.0.0.1:8867", "http://localhost:9001/", "http://[::1]:8867"])("%s is asked", async (url) => {
    vi.stubEnv("MANU_PADDLE_URL", url);
    const f = vi.fn(async () => new Response(JSON.stringify({ lines: [{ text: "x", score: 1 }] })));
    vi.stubGlobal("fetch", f);
    expect(await paddleRead(pages)).toEqual([{ text: "x", score: 1 }]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("sms-ocr-12: a PaddleOCR answer is read within limits", () => {
  it("a huge answer is cut to what the desk can hold, and the backup reading's text fits the approval's 30 000 characters", async () => {
    vi.stubEnv("MANU_PADDLE_URL", "http://127.0.0.1:8867");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ lines: Array.from({ length: 5000 }, (_, k) => ({ text: `line ${k} ${"word ".repeat(200)}`, score: 0.5 })) }))));
    const lines = (await paddleRead(pages))!;
    expect(lines.length).toBeLessThanOrEqual(1000);
    expect(Math.max(...lines.map((l) => l.text.length))).toBeLessThanOrEqual(500);
    expect(backupReading(lines).full_text.length).toBeLessThanOrEqual(30_000);
  });
});
