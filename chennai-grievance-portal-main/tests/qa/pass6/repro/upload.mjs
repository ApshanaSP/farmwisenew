// QA pass 6, P5-008 repro: node tests/qa/pass5/repro/upload.mjs <port> <MB> uploads one PDF of that size to the Manu Desk as the QA desk account.
import { call } from "../lib/live.mjs";
const port = Number(process.argv[2] || 3105), mb = Number(process.argv[3] || 12);
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(mb * 1024 * 1024, 0x20), Buffer.from("\n%%EOF\n")]);
const fd = new FormData(); fd.append("pages", new Blob([pdf], { type: "application/pdf" }), "scan.pdf");
const r = await call(port, "manu", "POST", "/api/manu/petitions", { body: fd, raw: true });
console.log(JSON.stringify({ port, mb, status: r.status, body: r.text.slice(0, 160) }));
