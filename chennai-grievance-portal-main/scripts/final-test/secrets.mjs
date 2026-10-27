// FINAL TEST L1: no key, token or secret name in the browser bundle. Prints the file and the pattern's name only, never a value.
//   node scripts/final-test/secrets.mjs [build dir]   (default .next-finaltest)
import fs from "fs";
import path from "path";
const dir = path.join(process.argv[2] || ".next-finaltest", "static");
const PATTERNS = {
  "Groq key": /gsk_[A-Za-z0-9]{20}/, "Google key": /AIza[0-9A-Za-z_-]{30}/, "AWS access key": /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
  "Bedrock key": /bedrock-api-key/i, "OpenAI-style key": /\bsk-[A-Za-z0-9]{32}/, "private key": /BEGIN [A-Z ]*PRIVATE KEY/,
  "server env name": /\b(REFRESH_API_KEY|JWT_SECRET|AWS_BEARER_TOKEN_BEDROCK|SMTP_PASS)\b/, "team API header": /x-refresh-key/i
};
if (!fs.existsSync(dir)) { console.log(`FAIL no build at ${dir}`); process.exit(1); }
let hits = 0, files = 0;
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { walk(p); continue; }
    if (!/\.(js|css|json|html|map|txt)$/.test(f.name)) continue;
    files++;
    const text = fs.readFileSync(p, "utf8");
    for (const [name, re] of Object.entries(PATTERNS)) if (re.test(text)) { hits++; console.log(`FAIL ${name} in ${path.relative(dir, p)}`); }
  }
};
walk(dir);
console.log(hits ? `FAIL (${hits})` : `PASS (${files} files, ${Object.keys(PATTERNS).length} patterns)`);
process.exit(hits ? 1 : 0);
