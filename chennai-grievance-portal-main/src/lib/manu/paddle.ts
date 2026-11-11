/**
 * Step one of reading a petition: PaddleOCR on this computer (manu_paddle_ocr/server.py). Step two is the AI OCR in read.ts.
 *
 * PaddleOCR is too weak on handwriting to be the reader, so it does two narrower jobs. It is a second pair of eyes on the numbers the
 * AI OCR gets wrong most (phone numbers and dates), and when the AI OCR cannot answer, its text fills the form for the officer to fix.
 * It only ever adds a doubt: it never changes what the AI OCR read. When the service is off, the desk reads with the AI OCR alone.
 */
import { READ_FIELDS, type PaddleSaw, type Reading } from "./constants";
import { maskAadhaar, normalDate, tenDigits } from "./clean";

export interface PaddleLine { text: string; score: number }

const baseUrl = (): string | null => {
  const v = (process.env.MANU_PADDLE_URL ?? "").trim();
  if (/^off$/i.test(v)) return null;
  return (v || "http://127.0.0.1:8867").replace(/\/+$/, "");
};

/** Up to three petitions are read at once and the service takes one page at a time, so a page may wait for several others. */
const PAGE_WAIT_MS = 90_000;
const MOST_WAIT_MS = 300_000;

/** Every page's lines, or null when the service is off or could not read a page, which sends the petition to the AI OCR alone. */
export async function paddleRead(pages: { data: string }[], onPage?: (page: number) => void): Promise<PaddleLine[] | null> {
  const base = baseUrl();
  if (!base) return null;
  const stop = AbortSignal.timeout(Math.min(MOST_WAIT_MS, PAGE_WAIT_MS * Math.max(1, pages.length)));
  try {
    const lines: PaddleLine[] = [];
    for (const [k, p] of pages.entries()) {
      onPage?.(k + 1);
      const r = await fetch(`${base}/read`, { method: "POST", body: Buffer.from(p.data, "base64"), headers: { "Content-Type": "application/octet-stream" }, signal: stop });
      if (!r.ok) throw new Error(`answered ${r.status}`);
      const j = (await r.json()) as { lines?: PaddleLine[] };
      if (!Array.isArray(j.lines)) throw new Error("no lines in the answer");
      lines.push(...j.lines);
    }
    return lines.map((l) => ({ text: maskAadhaar(String(l.text ?? "")), score: Number(l.score) || 0 }));
  } catch (e) {
    console.warn(`[manu] PaddleOCR step skipped: ${(e as Error).message}`);
    return null;
  }
}

const MOBILE = /(?<!\d)\d[\d .\-–]{8,16}\d(?!\d)/g;
const PINCODE = /(?<!\d)6\s?0\s?0\s?[\d ]{3,5}(?!\d)/g;
const DATE = /(?<!\d)\d{1,2}\s?[./\-]\s?\d{1,2}\s?[./\-]\s?(?:\d{4}|\d{2})(?!\d)/g;
/** The Collector's own office address is on nearly every petition, so it says nothing about the writer's pincode. */
const OFFICE_PINCODE = "600001";

/** The phone numbers, pincodes and dates found on the page. Mobiles come most confident first, dates last-written first. */
export function numbersOn(lines: PaddleLine[]): Record<keyof PaddleSaw, string[]> {
  const mobiles: { v: string; score: number }[] = [], pincodes: string[] = [], dates: string[] = [];
  for (const l of lines) {
    // masked first: a 12-digit Aadhaar number starting 91 would otherwise pass for +91 and a mobile
    const text = maskAadhaar(l.text);
    for (const m of text.match(MOBILE) ?? []) {
      const d = tenDigits(m);
      if (/^[6-9]\d{9}$/.test(d)) mobiles.push({ v: d, score: l.score });
    }
    for (const m of text.match(PINCODE) ?? []) {
      const d = m.replace(/\D/g, "");
      if (d.length === 6 && d !== OFFICE_PINCODE) pincodes.push(d);
    }
    for (const m of text.match(DATE) ?? []) {
      const d = normalDate(m);
      if (d) dates.push(d);
    }
  }
  return { mobile: mobiles.sort((a, b) => b.score - a.score).map((m) => m.v), pincode: pincodes, date: dates.reverse() };
}

const CHECKED: (keyof PaddleSaw)[] = ["mobile", "pincode", "date"];

/** Marks each number PaddleOCR read differently from the AI OCR. No flag when PaddleOCR found no such number on the page: silence is not a doubt. */
export function crossCheck(reading: Reading, first: PaddleLine[] | null): Reading {
  if (!first) return { ...reading, readers: "ai" };
  const seen = numbersOn(first);
  const unsure = new Set(reading.unsure_fields);
  const saw: PaddleSaw = {};
  for (const f of CHECKED) {
    if (seen[f].length && !seen[f].includes(reading[f] ?? "")) { unsure.add(f); saw[f] = seen[f][0]; }
  }
  return { ...reading, unsure_fields: [...unsure], readers: "paddle+ai", ...(Object.keys(saw).length ? { paddle_saw: saw } : {}) };
}

/** When the AI OCR cannot answer: PaddleOCR's text and numbers, every field marked, and the department left for the officer to choose. */
export function backupReading(lines: PaddleLine[]): Reading {
  const text = maskAadhaar(lines.map((l) => l.text).join("\n"));
  const n = numbersOn(lines);
  return {
    name: null, mobile: n.mobile[0] ?? null, door_no: null, street: null, area_en: null, pincode: n.pincode[0] ?? null, ward: null, date: n.date[0] ?? null,
    aadhaar_last4: text.match(/XXXX XXXX (\d{4})/)?.[1] ?? null,
    subject: null, problem_en: "", request_en: "",
    language: /[஀-௿]/.test(text) ? "ta" : "en",
    department: "", category: "OTHER", urgent: false,
    unsure_fields: [...READ_FIELDS],
    full_text: text,
    readers: "paddle"
  };
}
