// QA pass 6, redsec2: personal data in the server's log. Counts and patterns only, never a value.
import fs from "node:fs";
const file = process.argv[2] ?? "data/aws-cache/qa/run/srv-3106.log";
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const lines = text.split(/\r?\n/);
const pats = {
  email: /[\w.+-]+@[\w-]+\.[\w.]+/, mobile: /(?<![\d.])[6-9]\d{9}(?!\d)/, aadhaar: /(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/, otp: /\b(otp|code)\b\D{0,12}\d{4,6}\b/i,
  sql: /\b(SELECT|INSERT INTO|UPDATE)\b.{0,40}\b(FROM|SET|VALUES)\b/i, cookie: /(diq|session|token)[\w-]*=ey/i, jwt: /eyJ[\w-]{10,}\.[\w-]{10,}/, bearer: /bearer\s+[\w.-]{10,}/i
};
const counts = {}, where = {};
for (const l of lines) for (const [k, re] of Object.entries(pats)) if (re.test(l)) { counts[k] = (counts[k] ?? 0) + 1; const tag = (l.match(/\[[\w/ -]+\]|^[\w ]{3,40}(?= failed)/) ?? ["(untagged)"])[0]; (where[k] ??= {})[tag] = (where[k][tag] ?? 0) + 1; }
console.log(file, "lines", lines.length, "counts", JSON.stringify(counts));
console.log("by log tag", JSON.stringify(where));
