// QA pass 4: a local stand-in for the team API, serving the pinned snapshot. Servers point AWS_API_URL at it, so the real store.ts
// code path loads a fixed build and can never reach AWS. /store/write is refused loudly: in dry-run it must never be called.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PIN_DIR, PIN_PORT, PIN_URL } from "./lib/env.mjs";

const read = (f) => fs.readFileSync(path.join(PIN_DIR, f));
const pinned = (v) => (typeof v === "string" && v.startsWith("PIN:") ? PIN_URL + v.slice(4) : v);
const manifest = () => { const m = JSON.parse(read("manifest.json")); for (const t of Object.values(m.tables)) t.url = pinned(t.url); return JSON.stringify(m); };
const load = () => { const l = JSON.parse(read("load.json")); l.rows = pinned(l.rows); l.reference = pinned(l.reference); return JSON.stringify(l); };
const rows = () => read(fs.existsSync(path.join(PIN_DIR, "rows.seeded.json.gz")) ? "rows.seeded.json.gz" : "rows.json.gz");
const WRITE_LOG = path.join(PIN_DIR, "WRITE_ATTEMPTS.log");
http.createServer((req, res) => {
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(body); };
  try {
    const u = new URL(req.url, PIN_URL);
    if (req.method === "POST" && u.pathname === "/intel/snapshot") return send(200, manifest());
    if (req.method === "POST" && u.pathname === "/store/load") return send(200, load());
    if (req.method === "POST" && u.pathname === "/store/write") { fs.appendFileSync(WRITE_LOG, `${new Date().toISOString()} write attempt\n`); return send(500, '{"error":"writes are refused in QA"}'); }
    if (req.method === "GET" && u.pathname === "/rows") return send(200, rows(), "application/gzip");
    if (req.method === "GET" && u.pathname === "/reference") return send(200, read("reference.json.gz"), "application/gzip");
    if (req.method === "GET" && u.pathname.startsWith("/t/")) return send(200, read(`tables/${path.basename(u.pathname)}.json.gz`), "application/gzip");
    if (req.method === "GET" && u.pathname === "/health") return send(200, '{"ok":true}');
    return send(404, '{"error":"not in the pinned API"}');
  } catch (e) { return send(500, JSON.stringify({ error: String(e.message) })); }
}).listen(PIN_PORT, "127.0.0.1", () => console.log(`pinned API on ${PIN_URL}`));
