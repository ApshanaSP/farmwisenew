/**
 * A digest the browser built (the Stage's stageDigest, a console step's observation digest) is untrusted client input, and the row titles
 * in it can hold a citizen's own words. Before one goes into any prompt it is scrubbed here (v4, lane L2): the same masking the tool
 * results get (privacy.ts redactText: phones, Aadhaar, e-mails, numbers said as words), a letter's salutation ("Respected sir,") dropped,
 * a quoted sentence (three words or more in quotes: the citizen speaking) replaced by [quote], and a piece that names whoever filed
 * (exitgate.ts namesCitizen) replaced by [hidden]. A digest that is JSON (stagelocal.ts stageDigest) is scrubbed value by value. Pure.
 */
import { namesCitizen } from "./exitgate";
import { redactText } from "./privacy";

const SALUTATION = /\b(?:respected|dear)\s+(?:sir|madam|sir\s*\/\s*madam|officer|collector)\b[\s,.:;-]*/gi;
/** three words or more inside curly or angle quotes */
const CURLY_QUOTED = /“[^”\n]*?\S\s+\S+\s+\S[^”\n]*?”|‘[^’\n]*?\S\s+\S+\s+\S[^’\n]*?’|«[^»\n]*?\S\s+\S+\s+\S[^»\n]*?»/g;
/** three words or more inside straight quotes (plain text only: in JSON the straight quotes are its own) */
const STRAIGHT_QUOTED = /"[^"\n]*?\S\s+\S+\s+\S[^"\n]*?"/g;
/** a quote inside a JSON string, escaped: \"three words or more\" */
const ESCAPED_QUOTED = /\\"[^"\\\n]*?\S\s+\S+\s+\S[^"\\\n]*?\\"/g;

function scrubText(s: string, json: boolean): string {
  let t = redactText(s).replace(ESCAPED_QUOTED, "[quote]").replace(CURLY_QUOTED, "[quote]");
  if (!json) t = t.replace(STRAIGHT_QUOTED, "[quote]");
  t = t.replace(SALUTATION, " ");
  // a piece (between the digest's own separators) that names whoever filed goes whole
  const pieces = t.split(/(\s*[;|]\s*|\s+\/\s+)/);
  return pieces.map((p, i) => (i % 2 === 0 && namesCitizen(p) ? "[hidden]" : p)).join("").replace(/[ \t]{2,}/g, " ");
}

function walk(v: unknown, depth: number): unknown {
  if (depth > 6) return null;
  if (typeof v === "string") return scrubText(v, false).trim();
  if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, depth + 1)]));
  return v;
}

/** A digest as a prompt may hold it, at most `max` characters. */
export function scrubDigest(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const raw = String(s);
  const t = raw.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try { return JSON.stringify(walk(JSON.parse(t), 0)).slice(0, max); } catch { return scrubText(t, true).trim().slice(0, max); }
  }
  return scrubText(t, false).trim().slice(0, max);
}
