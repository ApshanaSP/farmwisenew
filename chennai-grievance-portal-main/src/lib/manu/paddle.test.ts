import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reading } from "./constants";
import { backupReading, crossCheck, numbersOn, paddleRead, type PaddleLine } from "./paddle";

const L = (...t: string[]): PaddleLine[] => t.map((text) => ({ text, score: 0.9 }));
const reading = (o: Partial<Reading> = {}): Reading => ({
  name: "க. செல்வி", mobile: "9000052397", door_no: "8", street: "தெரு", area_en: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", aadhaar_last4: null, subject: null,
  problem_en: "Sewage", request_en: "Clear it", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false, unsure_fields: [], full_text: "text", ...o
});

describe("finding numbers in PaddleOCR's lines", () => {
  it("reads a mobile written with a dash or spaces", () => {
    expect(numbersOn(L("கைபேசி: 90000-52697")).mobile).toEqual(["9000052697"]);
    expect(numbersOn(L("Mobile 90000 52697")).mobile).toEqual(["9000052697"]);
  });
  it("drops what cannot be a mobile", () => expect(numbersOn(L("20000-90734", "90000 5269")).mobile).toEqual([]));
  it("puts the most confident mobile first", () =>
    expect(numbersOn([{ text: "9000011111", score: 0.6 }, { text: "9000022222", score: 0.95 }]).mobile).toEqual(["9000022222", "9000011111"]));
  it("never takes an Aadhaar number for +91 and a mobile", () => {
    expect(numbersOn(L("ஆதார் 9167 4512 7731")).mobile).toEqual([]);
    expect(numbersOn(L("916745127731")).mobile).toEqual([]);
  });
  it("skips the Collector's own pincode", () => expect(numbersOn(L("சென்னை - 600 001.", "ராயபுரம், சென்னை - 600 013.")).pincode).toEqual(["600013"]));
  it("gives the last date written first, in the desk's format", () => expect(numbersOn(L("on 12-8-2026 I wrote", "நாள்: 28.9.2026")).date).toEqual(["28.09.2026", "12.08.2026"]));
  it("ignores a date that cannot exist", () => expect(numbersOn(L("நாள்: 31.02.2026")).date).toEqual([]));
});

describe("comparing the two readers", () => {
  it("marks a mobile they read differently and keeps the AI's value", () => {
    const r = crossCheck(reading(), L("கைபேசி: 90000-52697"));
    expect(r.mobile).toBe("9000052397");
    expect(r.unsure_fields).toEqual(["mobile"]);
    expect(r.paddle_saw).toEqual({ mobile: "9000052697" });
    expect(r.readers).toBe("paddle+ai");
  });
  it("adds no doubt when they agree", () => {
    const r = crossCheck(reading(), L("90000-52397", "600 011", "நாள்: 12.09.2026"));
    expect(r.unsure_fields).toEqual([]);
    expect(r.paddle_saw).toBeUndefined();
  });
  it("adds no doubt when PaddleOCR found no such number: silence is not a doubt", () => expect(crossCheck(reading(), L("அனுப்புநர்")).unsure_fields).toEqual([]));
  it("is satisfied when any number on the page agrees", () => expect(crossCheck(reading({ date: "12.08.2026" }), L("on 12-8-2026 I wrote", "நாள்: 28.9.2026")).unsure_fields).toEqual([]));
  it("marks a number the AI OCR left blank", () => {
    const r = crossCheck(reading({ mobile: null }), L("90000-52697"));
    expect(r.unsure_fields).toEqual(["mobile"]);
    expect(r.mobile).toBeNull();
  });
  it("keeps doubts the AI OCR already had, once each", () => expect(crossCheck(reading({ unsure_fields: ["mobile", "name"] }), L("90000-52697")).unsure_fields.sort()).toEqual(["mobile", "name"]));
  it("says when PaddleOCR did not take part", () => {
    const r = crossCheck(reading(), null);
    expect(r.readers).toBe("ai");
    expect(r.unsure_fields).toEqual([]);
  });
});

describe("the backup when the AI OCR cannot answer", () => {
  const b = backupReading(L("அனுப்புநர் க. செல்வி", "90000-52697", "ராயபுரம் - 600 013.", "ஆதார் 9999 4512 7731", "நாள்: 28.9.2026"));
  it("fills the numbers and the text", () => {
    expect(b).toMatchObject({ mobile: "9000052697", pincode: "600013", date: "28.09.2026", language: "ta", readers: "paddle" });
    expect(b.full_text).toContain("அனுப்புநர் க. செல்வி");
  });
  it("marks every field and leaves the department to the officer", () => {
    expect(b.unsure_fields).toContain("full_text");
    expect(b.unsure_fields).toContain("mobile");
    expect(b.department).toBe("");
    expect(b.problem_en).toBe("");
  });
  it("never carries a whole Aadhaar number", () => {
    expect(JSON.stringify(b)).not.toMatch(/9999\s?4512/);
    expect(b.aadhaar_last4).toBe("7731");
  });
});

describe("asking the service", () => {
  const pages = [{ data: Buffer.from("one").toString("base64") }, { data: Buffer.from("two").toString("base64") }];
  beforeEach(() => { vi.stubEnv("MANU_PADDLE_URL", "http://paddle.test"); vi.spyOn(console, "warn").mockImplementation(() => undefined); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("joins the lines of every page, and masks Aadhaar on arrival", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ lines: [{ text: "9999 4512 7731", score: 0.9 }] })));
    vi.stubGlobal("fetch", f);
    const r = await paddleRead(pages);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r).toEqual([{ text: "XXXX XXXX 7731", score: 0.9 }, { text: "XXXX XXXX 7731", score: 0.9 }]);
  });
  it("is null when the service is not running", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await paddleRead(pages)).toBeNull();
  });
  it("is null when a page fails, rather than a half reading", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response(JSON.stringify({ lines: [] })) : new Response("{}", { status: 500 }))));
    expect(await paddleRead(pages)).toBeNull();
  });
  it("does not call out when switched off", async () => {
    vi.stubEnv("MANU_PADDLE_URL", "off");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await paddleRead(pages)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
