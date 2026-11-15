#!/usr/bin/env node
/**
 * Makes the two keys the website locks personal data with (src/lib/pii.ts) and writes them into .env:
 *   DATA_ENCRYPTION_KEY  locks names, mobile numbers, e-mails, addresses, petition text, petition scans and profile photos
 *   BLIND_INDEX_KEY      makes the fingerprints that let "the same mobile number" be found without unlocking every row
 * Each is 32 random bytes as base64. The values are never printed.
 *
 *   node scripts/pii-keys.js            add the keys .env lacks (an existing key is never replaced)
 *   node scripts/pii-keys.js --rotate   new DATA_ENCRYPTION_KEY; the old one moves to DATA_ENCRYPTION_KEY_OLD so saved rows still unlock
 *
 * Keep a copy of both values in a password manager: without DATA_ENCRYPTION_KEY the locked data cannot be read by anyone.
 * Every copy of the website that reads the same AWS data (a teammate's laptop) needs the same two values in its .env.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", ".env");
const rotate = process.argv.includes("--rotate");
let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const get = (name) => (text.match(new RegExp(`^${name}=(.*)$`, "m")) || [])[1]?.trim() || "";
const set = (name, value) => {
  const line = `${name}=${value}`;
  text = new RegExp(`^${name}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${name}=.*$`, "m"), line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
};
const fresh = () => crypto.randomBytes(32).toString("base64");

const done = [];
if (rotate) {
  const cur = get("DATA_ENCRYPTION_KEY");
  if (!cur) { console.error("There is no DATA_ENCRYPTION_KEY to rotate; run without --rotate first."); process.exit(1); }
  set("DATA_ENCRYPTION_KEY_OLD", [cur, ...get("DATA_ENCRYPTION_KEY_OLD").split(",").map((s) => s.trim()).filter(Boolean)].join(","));
  set("DATA_ENCRYPTION_KEY", fresh());
  done.push("new DATA_ENCRYPTION_KEY (the old one is in DATA_ENCRYPTION_KEY_OLD)");
} else {
  if (!text.includes("# Personal-data encryption")) text = `${text.replace(/\s*$/, "")}\n\n# Personal-data encryption (src/lib/pii.ts). Keep a copy of both in a password manager.\n`;
  if (!get("DATA_ENCRYPTION_KEY")) { set("DATA_ENCRYPTION_KEY", fresh()); done.push("DATA_ENCRYPTION_KEY"); }
  if (!get("BLIND_INDEX_KEY")) { set("BLIND_INDEX_KEY", fresh()); done.push("BLIND_INDEX_KEY"); }
}
if (!done.length) { console.log(".env already has both keys; nothing changed."); process.exit(0); }
fs.writeFileSync(file, text, { mode: 0o600 });
console.log(`Wrote ${done.join(" and ")} to ${file}. Restart the website to use ${done.length > 1 ? "them" : "it"}.`);
