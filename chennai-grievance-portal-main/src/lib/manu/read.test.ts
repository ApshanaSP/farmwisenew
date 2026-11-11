import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ order: [] as string[], ready: true, ai: null as null | Error, lines: null as null | { text: string; score: number }[], aiArgs: null as null | Record<string, unknown> }));

vi.mock("@/lib/ai/claude", () => ({
  claudeConfigured: () => h.ready,
  claudeJson: async (a: Record<string, unknown>) => {
    h.order.push("ai"); h.aiArgs = a;
    if (h.ai) throw h.ai;
    return { model: "claude-test", ms: 10, object: {
      name: "க. செல்வி", mobile: "9000052397", door_no: "8", street: "தெரு", area_en: "Perambur", pincode: "600011", ward: "70", date: "12.09.2026", aadhaar_last4: null, subject: null,
      problem_en: "Sewage", request_en: "Clear it", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false, unsure_fields: [], full_text: "text"
    } };
  }
}));
vi.mock("./paddle", async (actual) => ({ ...(await actual<typeof import("./paddle")>()), paddleRead: async () => { h.order.push("paddle"); return h.lines; } }));

import { readPetition } from "./read";

const page = [{ mediaType: "image/jpeg" as const, data: "AAAA" }];

describe("reading a petition in two steps", () => {
  beforeEach(() => { h.order = []; h.ready = true; h.ai = null; h.aiArgs = null; h.lines = [{ text: "90000-52697", score: 0.9 }]; vi.spyOn(console, "warn").mockImplementation(() => undefined); });

  it("runs PaddleOCR first and the AI OCR next, and marks where they differ", async () => {
    const r = await readPetition(page);
    expect(h.order).toEqual(["paddle", "ai"]);
    expect(r.model).toBe("paddle+claude-test");
    expect(r.reading.mobile).toBe("9000052397");
    expect(r.reading.unsure_fields).toContain("mobile");
    expect(r.reading.paddle_saw?.mobile).toBe("9000052697");
  });
  it("reports each stage as it happens, for the desk to show", async () => {
    const seen: string[] = [];
    await readPetition(page, (s) => seen.push(`${s.step}:${s.paddle ?? ""}`));
    expect(seen).toEqual(["ai:done", "compare:done"]);
  });
  it("reports when PaddleOCR could not take part", async () => {
    h.lines = null;
    const seen: (string | undefined)[] = [];
    await readPetition(page, (s) => seen.push(s.paddle));
    expect(seen).toEqual(["off", "off"]);
  });
  it("gives the AI OCR the photos and none of PaddleOCR's text", async () => {
    await readPetition(page);
    expect(h.aiArgs?.images).toEqual(page);
    expect(JSON.stringify(h.aiArgs)).not.toContain("52697");
  });
  it("reads with the AI OCR alone when PaddleOCR is off", async () => {
    h.lines = null;
    const r = await readPetition(page);
    expect(r.reading.readers).toBe("ai");
    expect(r.model).toBe("claude-test");
  });
  it("keeps PaddleOCR's text when the AI OCR fails", async () => {
    h.ai = new Error("overloaded");
    const r = await readPetition(page);
    expect(r.model).toBe("paddle");
    expect(r.reading).toMatchObject({ readers: "paddle", mobile: "9000052697", department: "" });
  });
  it("keeps PaddleOCR's text when there is no AI key", async () => {
    h.ready = false;
    expect((await readPetition(page)).reading.readers).toBe("paddle");
    expect(h.order).toEqual(["paddle"]);
  });
  it("fails when neither step could read, so staff can type it in", async () => {
    h.ai = new Error("overloaded"); h.lines = null;
    await expect(readPetition(page)).rejects.toThrow("overloaded");
  });
  it("fails when PaddleOCR found nothing and the AI OCR is down", async () => {
    h.ai = new Error("overloaded"); h.lines = [];
    await expect(readPetition(page)).rejects.toThrow("overloaded");
  });
});
