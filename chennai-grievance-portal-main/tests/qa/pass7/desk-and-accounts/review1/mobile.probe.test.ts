/**
 * Adversarial review 1 of 2b5d080 (hunt2-desk-04): the desk's Mobile box, as the browser, typedMobile() and the server's fileSchema read it.
 * Each test states what SHOULD be stored; a failing test is a finding.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review1
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: { query: async () => [[], []] }, withTransaction: async () => undefined }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, sendMail: async () => ({ ok: true }) }));
vi.mock("@/lib/manu/read", () => ({ readPetition: async () => null }));

const { fileSchema } = await import("@/lib/manu/petitions");
const { typedMobile, MOBILE_TYPED_MAX, cleanReading } = await import("@/lib/manu/clean");

const raw = (mobile: string) => ({ name: "R. Kumar", mobile, door: "27", street: "Jawahar Street", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", subject: "Street light",
  problem: "Street light not working near the school", request: "Repair it", dept: "GCC-ELE", urgent: false, fullText: "From R. Kumar" });
/** what the server stores for what the desk's box holds: undefined when the server refuses it */
const stored = (box: string): string | undefined => { const r = fileSchema.safeParse(raw(box)); return r.success ? r.data.mobile : undefined; };
/** the box: the browser applies maxLength to the raw paste (HTML maxlength truncates inserted text), then onChange runs typedMobile */
const pasted = (text: string) => typedMobile(text.slice(0, MOBILE_TYPED_MAX));

describe("review1 hunt2-desk-04: a mobile that is not the petitioner's is never stored", () => {
  it("'+91 98400 123' (a +91 number two digits short, as a reader or a typist drops them) is refused, not stored as 9198400123", () => {
    expect(stored("+91 98400 123")).toBeUndefined();
  });
  it("'Mobile no: +91 98400 12345' pasted into the box (26 characters; the browser keeps 24) is not stored as 9198400123", () => {
    const box = pasted("Mobile no: +91 98400 12345");
    const s = stored(box);
    expect(s === "9840012345" || s === undefined, `box "${box}" stored as ${s}`).toBe(true);
  });
  it("an Aadhaar number in 4-4-4 groups starting 91 typed into the box ('9198 4001 2345') is refused, as the reader's check refuses it", () => {
    // the reader's own path never keeps it (P5-007): cleanReading gives null
    const fromReader = cleanReading({ mobile: "9198 4001 2345", pincode: null, ward: null, date: null, unsure_fields: [], aadhaar_last4: null, name: null, door_no: null, street: null, area_en: null,
      subject: null, problem_en: "", request_en: "", language: "en", department: "GCC-ELE", category: "OTHER", urgent: false, full_text: "" } as never, "2026-11-13");
    expect(fromReader.mobile).toBeNull();
    expect(stored("9198 4001 2345")).toBeUndefined();
  });
});

describe("review1 hunt2-desk-04: what held up (the number is stored right, or refused)", () => {
  const right: [string, string][] = [
    ["+91 98400 12345", "plain"], ["(+91) 98400-12345", "brackets"], ["+91 98400–12345", "en dash"], ["+91 98400 12345", "no-break spaces"],
    ["＋９１ ９８４００ １２３４５", "fullwidth"], ["+91　９８４００　１２３４５", "ideographic spaces"], ["0091-98400-12345", "0091 dashes"], ["00 91 98400 12345", "00 91"],
    ["91 98400 12345", "91 without plus"], ["0 98400 12345", "0 and space"], ["98400 12345 (son)", "a word after"], ["Ph: 98400 12345", "label, short"]
  ];
  for (const [w, kind] of right) it(`${kind}: ${JSON.stringify(w)} -> 9840012345`, () => expect(stored(pasted(w))).toBe("9840012345"));
  const refused = ["98400 12345 / 94440 54321", "044 2434 5678", "+91 44 2434 5678", "091 98400 12345", "+91 0 98400 12345", "+91 98400 1234", "98400 1234", "1st mobile 98400 12345"];
  for (const w of refused) it(`refused: ${JSON.stringify(w)}`, () => expect(stored(pasted(w))).toBeUndefined());
});
