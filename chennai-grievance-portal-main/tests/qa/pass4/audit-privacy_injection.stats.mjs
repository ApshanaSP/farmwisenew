// QA pass 4, audit of fixed bugs (privacy_injection): how much of the pinned snapshot the spoken-text and redaction gaps touch. Counts only: no record's text is written.
//   node tests/qa/pass4/audit-privacy_injection.stats.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { APP_ROOT, PIN_DIR } from "./lib/env.mjs";

const load = (n) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "tables", `${n}.json.gz`))).toString("utf8"));
const t = load("incidents");
const c = Object.fromEntries(t.columns.map((x, i) => [x[0], i]));
const wc = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
const PHONE = /(?<![\d-])(?:\+?91[\s.\/-]?)?[6-9]\d(?:[\s.\/() ‐-―−-]?\d){8}(?!\d)/;
const LAND = /(?<![\d-])0\d{2,4}[\s.\/() ‐-―−-]{0,3}\d{6,8}(?!\d)/;
const MAIL = /[\w.+-]+\s*(?:@|＠|\[at\]|\(at\)|\sat\s)\s*[\w-]+\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)\s*[a-z]{2,}/i;
const DOOR = /\b(?:door|d\.?\s*no|h\.?\s*no|house|flat|plot|old\s*no|new\s*no)\b\.?\s*(?:no\.?)?\s*[:#-]?\s*\d+/i;
const INSTR = /\b(ignore|approve|delete|send|forward|tell the collector|collector must)\b/i;
const out = { build: JSON.parse(fs.readFileSync(path.join(PIN_DIR, "info.json"), "utf8")).build_id, incidents: t.rows.length, title_with_phone: 0, title_with_landline: 0, title_with_mail: 0, place_with_phone: 0, place_six_words_or_more: 0, place_ten_words_or_more: 0, place_door_number: 0, title_with_instruction_word: 0, title_90_chars_or_less: 0, open_severe: 0, open_severe_title_90_or_less: 0 };
for (const r of t.rows) {
  const title = String(r[c.title] ?? ""), place = String(r[c.place_text] ?? "");
  if (PHONE.test(title)) out.title_with_phone++;
  if (LAND.test(title)) out.title_with_landline++;
  if (MAIL.test(title)) out.title_with_mail++;
  if (PHONE.test(place)) out.place_with_phone++;
  if (wc(place) >= 6) out.place_six_words_or_more++;
  if (wc(place) >= 10) out.place_ten_words_or_more++;
  if (DOOR.test(place)) out.place_door_number++;
  if (INSTR.test(title)) out.title_with_instruction_word++;
  if (title.length <= 90) out.title_90_chars_or_less++;
  if (r[c.severity_level] === "Severe" && Number(r[c.is_open]) === 1) { out.open_severe++; if (title.length <= 90) out.open_severe_title_90_or_less++; }
}
fs.writeFileSync(path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit", "privacy_injection-stats.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
