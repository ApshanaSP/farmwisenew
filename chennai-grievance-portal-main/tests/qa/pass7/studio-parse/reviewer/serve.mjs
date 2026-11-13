// Stands in for the web server: forks the committed reader bundle with parse-pool.ts's own fork options and sends it one job.
//   node serve.mjs big <rows> <cols> <len>    a shared-string workbook; prints the server's heap, RSS and longest event-loop gap when the reply lands
//   node serve.mjs orphan                    an unended-deflate workbook; the "server" then dies (process.exit) while the reader is in SheetJS
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sharedStringXlsx, unendedDeflate } from "./craft.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const [, , mode, rows = "10000", cols = "50", len = "800"] = process.argv;
const buf = mode === "orphan" ? unendedDeflate() : sharedStringXlsx(+rows, +cols, +len);
const env = {}; for (const k of Object.keys(process.env)) if (["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"].includes(k.toUpperCase())) env[k] = process.env[k];
env.STUDIO_PARSE_RSS_MB = "1536";
const child = fork(path.join(ROOT, "scripts", "studio-parse-worker.mjs"), [], { execArgv: ["--max-old-space-size=1024"], env, serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
child.stderr.on("data", (d) => process.stderr.write("[reader] " + d));
child.on("exit", (c, s) => console.log("reader exit", c, s));
let last = performance.now(), gap = 0;
const iv = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 10);
const mb = (n) => Math.round(n / 1048576);
const base = process.memoryUsage();
let t0 = 0;
child.on("message", (m) => {
  if (m.ready) {
    console.log("reader pid", child.pid, "file", (buf.length / 1048576).toFixed(2), "MB");
    t0 = performance.now(); gap = 0; last = performance.now();
    child.send({ id: 1, job: { op: "file", buf: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), name: "wards.xlsx", contentType: "", base: "https://example.invalid/", ocr: false, main: false } });
    if (mode === "orphan") setTimeout(() => { console.log("server exits now; reader", child.pid, "is inside SheetJS"); process.exit(0); }, 1500);
    return;
  }
  const r = m.reply; const mu = process.memoryUsage();
  const t = r.tables?.[0];
  console.log("reply after", Math.round(performance.now() - t0), "ms:", r.error ? r.error : `${t.rows.length} rows x ${t.headers.length} cols, cell length ${String(t.rows[0][0]).length}`);
  console.log("server heapUsed +", mb(mu.heapUsed - base.heapUsed), "MB, external +", mb(mu.external + mu.arrayBuffers - base.external - base.arrayBuffers), "MB, rss", mb(mu.rss), "MB, longest event-loop gap", Math.round(gap), "ms");
  clearInterval(iv); child.kill();
});
