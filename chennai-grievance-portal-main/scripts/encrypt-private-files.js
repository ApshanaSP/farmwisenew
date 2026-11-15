#!/usr/bin/env node
/**
 * Locks the petition scans and profile photos saved before encryption was switched on, in place, with DATA_ENCRYPTION_KEY from
 * .env. New files are locked when they are saved (src/lib/pii.ts encryptFile); this is the same format:
 *   "DIQENC1\n" | key id (8 ASCII hex: first 8 of SHA-256 of the key) | IV 12 | tag 16 | AES-256-GCM ciphertext, AAD = the file's kind
 * A file already locked is left alone, so running it again is safe. Prints counts only.
 *
 *   node scripts/encrypt-private-files.js           lock them
 *   node scripts/encrypt-private-files.js --check   only count what would be locked
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const env = fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "";
const raw = process.env.DATA_ENCRYPTION_KEY || (env.match(/^DATA_ENCRYPTION_KEY=(.*)$/m) || [])[1]?.trim();
if (!raw) { console.error("DATA_ENCRYPTION_KEY is not set (run node scripts/pii-keys.js first)."); process.exit(1); }
const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
if (key.length !== 32) { console.error("DATA_ENCRYPTION_KEY is not 32 bytes."); process.exit(1); }
const id = crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
const MAGIC = Buffer.from("DIQENC1\n", "latin1");
const check = process.argv.includes("--check");

const dirs = [
  { dir: process.env.PETITION_UPLOAD_DIR || path.join(root, "data", "private-uploads", "petitions"), kind: "petition-page", name: /^[a-f0-9]{32}\.(jpg|png)$/ },
  { dir: process.env.PROFILE_UPLOAD_DIR || path.join(root, "data", "private-uploads", "profile"), kind: "profile-photo", name: /^p-[a-f0-9]{20}\.(jpg|png)$/ }
];

for (const { dir, kind, name } of dirs) {
  let locked = 0, already = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!name.test(f)) continue;
    const file = path.join(dir, f);
    const buf = fs.readFileSync(file);
    if (buf.subarray(0, MAGIC.length).equals(MAGIC)) { already++; continue; }
    if (!check) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      c.setAAD(Buffer.from(kind));
      const body = Buffer.concat([c.update(buf), c.final()]);
      const tmp = `${file}.locking`;
      fs.writeFileSync(tmp, Buffer.concat([MAGIC, Buffer.from(id, "latin1"), iv, c.getAuthTag(), body]));
      fs.renameSync(tmp, file); // whole or not at all
    }
    locked++;
  }
  console.log(`${kind}: ${locked} ${check ? "would be locked" : "locked"}, ${already} already locked (${dir})`);
}
