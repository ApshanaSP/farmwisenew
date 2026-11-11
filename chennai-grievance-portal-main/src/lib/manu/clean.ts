/**
 * Everything the reader's answer goes through before anyone sees it, and the small text helpers the desk needs. Pure, so it is tested
 * on its own. The reader's numbers are the weak spot (the reading test: mobiles and dates), so a value that cannot be right is flagged
 * for the check instead of being passed on quietly. A whole Aadhaar number never leaves this file.
 */
import { MANU_DEPTS, READ_FIELDS, type ReadField, type Reading } from "./constants";

export type RawReading = Omit<Reading, "ward" | "unsure_fields"> & { ward: string | null; unsure_fields: string[] };

const AADHAAR = /(?<!\d)(\d{4})[\s.-]?(\d{4})[\s.-]?(\d{4})(?!\d)/g;

/** Any 12-digit number in the text, written with its first 8 digits hidden. */
export const maskAadhaar = (s: string): string => s.replace(AADHAAR, (_m, _a, _b, c) => `XXXX XXXX ${c}`);

export const digits = (s: string | null | undefined): string => String(s ?? "").replace(/\D/g, "");

/** A mobile number as its 10 digits: +91 and a leading 0 are dropped. */
export function tenDigits(s: string | null | undefined): string {
  const d = digits(s);
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d;
}

/** DD.MM.YYYY when the date can exist, else null. Two-digit years are this century. */
export function normalDate(s: string | null | undefined): string | null {
  const m = String(s ?? "").match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4}|\d{2})/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}`;
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

  let pincode: string | null = digits(r.pincode) || null;
  if (pincode && pincode.length !== 6) { pincode = null; unsure.add("pincode"); }

  const wd = digits(r.ward);
  let ward: number | null = wd ? Number(wd) : null;
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
