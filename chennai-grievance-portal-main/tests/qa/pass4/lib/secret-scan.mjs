// QA pass 4: shared helpers for the secret scans. Nothing here ever prints or returns a secret: a hit is only a name.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** Parses .env by hand (dotenv is not needed) and keeps every occurrence: a key set twice has two values to look for. */
export function readEnvFile(file) {
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) || (v.startsWith("'") && v.endsWith("'") && v.length > 1)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out.push({ name: m[1], value: v });
  }
  return out;
}

/** A name that says it holds a secret. Anything else is a setting (a host name, a model name), which is allowed to appear. */
export const SECRET_NAME = /KEY|SECRET|PASS|PASSWORD|TOKEN|CREDENTIAL|PRIVATE/i;
/** Sign-in names are not passwords, but they should not ship to a browser either. */
const IDENTITY_NAME = /^(SMTP_USER|DB_USER|ASSISTANT_RO_DB_USER)$/;
export const classOf = (name) => (SECRET_NAME.test(name) ? "secret" : IDENTITY_NAME.test(name) ? "identity" : "setting");

/** Forms a value can take once it is inside a bundle: as it is, base64, URL-encoded, and JSON-escaped. */
export function needlesFor(value) {
  const forms = new Set([value, Buffer.from(value).toString("base64"), encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]);
  return [...forms].map((s) => Buffer.from(s));
}

/** Key shapes. Each one needs enough characters after the prefix that a word in minified code cannot match by chance. */
export const KEY_PATTERNS = [
  ["aws-access-key-AKIA", /\bAKIA[0-9A-Z]{16}\b/],
  ["aws-temp-key-ASIA", /\bASIA[0-9A-Z]{16}\b/],
  ["groq-gsk_", /\bgsk_[A-Za-z0-9]{20,}/],
  ["anthropic-sk-ant", /\bsk-ant-[A-Za-z0-9_-]{16,}/],
  ["openai-sk", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["google-AIza", /\bAIza[0-9A-Za-z_-]{35}/],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ["slack-token", /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/],
  ["brevo-key", /\bxkeysib-[A-Za-z0-9-]{20,}|\bxsmtpsib-[A-Za-z0-9-]{20,}/],
  ["sendgrid-key", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ["stripe-live-key", /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ["huggingface-hf_", /\bhf_[A-Za-z]{30,}/],
  ["bedrock-bearer", /\bbedrock-api-key-[A-Za-z0-9+/=_-]{20,}|\bABSK[A-Za-z0-9+/=]{40,}/],
  ["jwt-signed", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["private-key-block", /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY/],
  ["database-url-with-password", /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s:/"'`@]{1,64}:[^\s/"'`@${}<>]{3,64}@/],
  ["bearer-literal", /\bBearer\s+[A-Za-z0-9._~+/-]{30,}={0,2}/],
];

/** Walks a folder; `keep` filters by the forward-slash path relative to the folder given. */
export function walk(dir, keep = () => true, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, keep, base, out);
    else if (e.isFile() && keep(path.relative(base, p).replace(/\\/g, "/"))) out.push(p);
  }
  return out;
}

/**
 * Looks in one buffer. Returns only names: {kind: "env"|"pattern", name, class}.
 * @param {Buffer} buf
 * @param {{name: string, needles: Buffer[], class: string}[]} envNeedles
 */
export function scanBuffer(buf, envNeedles) {
  const hits = [];
  for (const n of envNeedles) if (n.needles.some((x) => buf.includes(x))) hits.push({ kind: "env", name: n.name, class: n.class });
  const text = buf.toString("latin1");
  for (const [name, re] of KEY_PATTERNS) if (re.test(text)) hits.push({ kind: "pattern", name, class: "key-shape" });
  return hits;
}

/** The files inside a zip (.docx, .xlsx, .pptx, .zip) as [name, Buffer]. Reads the central directory, so a stored size of 0 in a local header does not matter. */
export function zipEntries(buf) {
  const out = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  let at = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count && at + 46 <= buf.length && buf.readUInt32LE(at) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(at + 10), csize = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28), extra = buf.readUInt16LE(at + 30), comment = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    try { out.push([name, method === 8 ? zlib.inflateRawSync(data) : data]); } catch { /* one damaged part: the others still count */ }
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

/** What is inside a compressed file git only sees as bytes. */
export function innerBuffers(filePath, buf) {
  try {
    if (/\.gz$/i.test(filePath) && buf[0] === 0x1f && buf[1] === 0x8b) return [["", zlib.gunzipSync(buf, { maxOutputLength: 480 * 1024 * 1024 })]];
    if (/\.(zip|docx|xlsx|pptx)$/i.test(filePath) && buf.readUInt32LE(0) === 0x04034b50) return zipEntries(buf);
  } catch { /* too large or damaged: reported as not opened */ }
  return [];
}
export const isContainer = (filePath) => /\.(gz|zip|docx|xlsx|pptx)$/i.test(filePath);
export const isLfsPointer = (buf) => buf.length < 400 && buf.subarray(0, 23).toString() === "version https://git-lfs";

/** Every value in .env longer than `min` characters, in the form scanBuffer wants. A value used by two names is kept under each. */
export function envNeedles(envFile, min = 7) {
  return readEnvFile(envFile).filter((e) => e.value.length > min).map((e) => ({ name: e.name, class: classOf(e.name), needles: needlesFor(e.value) }));
}
