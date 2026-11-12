/**
 * Everything the reader's answer goes through before anyone sees it, and the small text helpers the desk needs. Pure, so it is tested
 * on its own. The reader's numbers are the weak spot (the reading test: mobiles and dates), so a value that cannot be right is flagged
 * for the check instead of being passed on quietly. A whole Aadhaar number never leaves this file.
 */
import { MANU_DEPTS, READ_FIELDS, type ReadField, type Reading } from "./constants";
import { asciiDigits } from "@/lib/thunai/digits";

export type RawReading = Omit<Reading, "ward" | "unsure_fields"> & { ward: string | null; unsure_fields: string[] };

// QA pass 5 (P5-007): a petition's numbers come from a reader of handwriting and print, in Tamil and English. JavaScript's \d is ASCII only,
// so Tamil digits (௦ to ௯) and full-width digits (０ to ９) were dropped as "not a digit", and every number field joined all the digits it held.
// Every number below is read through asciiDigits() first, and taken as one number with clear edges.
// Digits of every script (Tamil, full-width, Devanagari ...: Unicode's Nd), read through pass 4's shared helper (lib/thunai/digits.ts, RC-13).
const DIGIT = String.raw`\p{Nd}`;
// Between the groups: anything that is not a letter, a mark or a digit (spaces, line breaks, dots, commas, slashes, underscores, every kind of
// dash and minus, full-width punctuation, zero-width characters), up to 8 of them. The first version took only space, dot, slash and the ASCII
// hyphen, so an en dash, a minus sign, a comma or a number split over two indented lines got through whole (P5-007, found by the reviewer).
const SEP = String.raw`[^\p{L}\p{M}\p{Nd}]`;
const AADHAAR = new RegExp(String.raw`(?<![${DIGIT}+])(${DIGIT}{4})${SEP}{0,8}(${DIGIT}{4})${SEP}{0,8}(${DIGIT}{4})(?!${DIGIT})`, "gu");
/** Written in Aadhaar's 4-4-4 groups (any separators between), as a reader returns one it was not asked for. */
const AADHAAR_SHAPED = new RegExp(String.raw`^\s*${DIGIT}{4}${SEP}{1,8}${DIGIT}{4}${SEP}{1,8}${DIGIT}{4}\s*$`, "u");

/** Every script's digits as ASCII digits; nothing else changes (pass 4's helper). */
export { asciiDigits };

/**
 * Any 12-digit number in the text, written with its first 8 digits hidden: in any script's digits, with up to eight separators of any kind
 * between the groups. A number written straight after "+" is a phone number (+91...), not Aadhaar.
 */
export const maskAadhaar = (s: string): string => s.replace(AADHAAR, (_m, _a, _b, c) => `XXXX XXXX ${asciiDigits(c)}`);

export const digits = (s: string | null | undefined): string => asciiDigits(String(s ?? "")).replace(/\D/g, "");

/** A mobile number as its 10 digits: +91, 0091 and a leading 0 are dropped. */
export function tenDigits(s: string | null | undefined): string {
  const d = digits(s);
  if (d.length === 14 && d.startsWith("0091")) return d.slice(4);
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d;
}

/** An Indian mobile number: ten digits starting 6, 7, 8 or 9. */
export const MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * What a person typed or pasted into a mobile box, as it was written: digits of any script, spaces, "+", "-", brackets. The desk's box
 * used to keep only ASCII digits and cut the value at 10 characters before anything read it, so "+91 98400 12345" became "9198400123", a
 * valid-looking number of somebody else (QA pass 6, hunt2-desk-04). The value is read as a number by tenDigits() on the server.
 */
export const MOBILE_TYPED_MAX = 24;
export const typedMobile = (s: string): string => s.replace(/[^\p{Nd}+\s()-]/gu, "").slice(0, MOBILE_TYPED_MAX);

const realDate = (d: number, mo: number, y: number): string | null => {
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}`;
};

/**
 * DD.MM.YYYY when the date can exist, else null. Two-digit years are this century. A year-first date (2026-03-15, as a form or a machine
 * writes it) is read year first, and each number must stand on its own: "2026-03-15" was read as 26.03.2015, "15.03.202" (a dropped digit)
 * as 15.03.2020, and "10:30, 15.03.2026" as no date at all (P5-007). The first date that can exist wins.
 */
export function normalDate(s: string | null | undefined): string | null {
  const v = asciiDigits(String(s ?? ""));
  for (const m of v.matchAll(/(?<!\d)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/g)) {
    const r = realDate(Number(m[3]), Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  // day, month and year joined only by a date's own separators (. / - or spaces): "9.10 am, 20.3.2026" was read as 09.10.2020 (the reviewer)
  for (const m of v.matchAll(/(?<![\d:.])(\d{1,2})(?:\s*[./-]\s*|\s+)(\d{1,2})(?:\s*[./-]\s*|\s+)(\d{4}|\d{2})(?![\d:])/g)) {
    const r = realDate(Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? `20${m[3]}` : m[3]));
    if (r) return r;
  }
  return null;
}

/**
 * The ward number in what was read: the number after "ward" (or வார்டு / வட்டம்) when the words say so, else the only number there.
 * Two numbers and no word to tell them apart ("12/3") is null, for the check: before, every digit was joined, so "Ward 7 (Zone 6)"
 * became ward 76 (P5-007).
 */
export function wardNumber(s: string | null | undefined): number | null | "unclear" {
  const v = asciiDigits(String(s ?? ""));
  const named = v.match(/(?:ward|வார்டு|வட்டம்)\s*(?:no\.?|number|எண்)?\s*[:.\-#]?\s*(\d{1,4})(?!\d)/iu);
  if (named) return Number(named[1]);
  // a zone's number is not the ward: "Zone 6, Ward Seven" has no ward number written in digits (the reviewer)
  if (/\bzone\b|மண்டலம்/i.test(v)) return "unclear";
  const all = v.match(/\d+/g) ?? [];
  if (!all.length) return null;
  return all.length === 1 ? Number(all[0]) : "unclear";
}

const blank = (s: string | null | undefined): string | null => {
  const v = String(s ?? "").trim();
  return v && !/^(null|none|n\/?a|-+)$/i.test(v) ? v : null;
};

/** The reader's answer as the check screen gets it. `today` is "YYYY-MM-DD". */
export function cleanReading(r: RawReading, today: string): Reading {
  const unsure = new Set<ReadField>(r.unsure_fields.filter((f): f is ReadField => (READ_FIELDS as readonly string[]).includes(f)));
  const text = (s: string | null | undefined) => { const v = blank(s); return v ? maskAadhaar(v) : null; };

  const m = tenDigits(r.mobile);
  let mobile: string | null = m || null;
  if (m && !/^[6-9]\d{9}$/.test(m)) unsure.add("mobile"); // too short, too long or not a mobile number: shown, and marked
  // twelve digits or more, or written in Aadhaar's 4-4-4 groups, can be an Aadhaar number the reader put in the wrong box: never kept (P5-007)
  // twelve digits starting 91 are a +91 mobile only when the rest is one; else they can be an Aadhaar number (the reviewer: 912345678901)
  const all12 = digits(r.mobile);
  if (m && (m.length >= 12 || AADHAAR_SHAPED.test(String(r.mobile ?? "")) || (all12.length === 12 && !/^[6-9]\d{9}$/.test(m)))) { mobile = null; unsure.add("mobile"); }

  let pincode: string | null = digits(r.pincode) || null;
  if (pincode && pincode.length !== 6) { pincode = null; unsure.add("pincode"); }

  const wn = wardNumber(r.ward);
  let ward: number | null = typeof wn === "number" ? wn : null;
  if (wn === "unclear") unsure.add("ward");
  if (ward !== null && (ward < 1 || ward > 200)) { ward = null; unsure.add("ward"); }

  let date = normalDate(r.date);
  if (blank(r.date) && !date) unsure.add("date");
  if (date) {
    const [d, mo, y] = date.split(".");
    if (`${y}-${mo}-${d}` > today) unsure.add("date"); // written in the future: a digit was misread
  }
  if (date === null) date = null;

  const last4 = digits(r.aadhaar_last4).slice(-4);
  return {
    name: text(r.name), mobile, door_no: text(r.door_no), street: text(r.street), area_en: text(r.area_en), pincode, ward, date,
    aadhaar_last4: last4.length === 4 ? last4 : null,
    subject: text(r.subject),
    problem_en: maskAadhaar(String(r.problem_en ?? "").trim()),
    request_en: maskAadhaar(String(r.request_en ?? "").trim()),
    language: r.language,
    department: MANU_DEPTS.some((d) => d.code === r.department) ? r.department : "GCC-GAD",
    category: r.category,
    urgent: !!r.urgent,
    unsure_fields: [...unsure],
    full_text: maskAadhaar(String(r.full_text ?? "").trim())
  };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 1 when the strings are the same, 0 when nothing matches. */
export const similarity = (a: string, b: string): number => (!a && !b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1));

/** Letters and digits only, any script, lower case. */
export const squash = (s: string | null | undefined): string => String(s ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

/** A place name by its consonants, so "Thandaiyarpettai" and "Tondiarpet" meet: Tamil names have many English spellings. */
export function phonetic(s: string): string {
  const w = s.toLowerCase().replace(/[^a-z]/g, "").replace(/zh/g, "l").replace(/th/g, "t").replace(/dh/g, "d").replace(/sh/g, "s").replace(/ch/g, "s")
    .replace(/bh/g, "b").replace(/ph/g, "f").replace(/kh/g, "k").replace(/gh/g, "g");
  if (!w) return "";
  return (w[0] + w.slice(1).replace(/[aeiouy]/g, "")).replace(/(.)\1+/g, "$1");
}

/** The area of `areas` whose name best fits what was read, or null when none is close. */
export function bestArea<T extends { name: string }>(read: string | null | undefined, areas: T[]): T | null {
  const key = phonetic(String(read ?? ""));
  if (key.length < 3) return null;
  let best: T | null = null, top = 0;
  for (const a of areas) {
    const s = similarity(key, phonetic(a.name)) + (squash(a.name) === squash(read) ? 1 : 0);
    if (s > top || (s === top && best && a.name.length < best.name.length)) { best = a; top = s; }
  }
  return top >= 0.75 ? best : null;
}

/** The IST wall clock, "YYYY-MM-DD HH:MM:SS". */
export const istNow = (at = Date.now()): string => new Date(at + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

/** An IST wall-clock time some hours later. */
export function addHours(ist: string, hours: number): string {
  return new Date(Date.parse(`${ist.replace(" ", "T")}Z`) + hours * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
}
