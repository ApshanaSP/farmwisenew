// Skeptic 2: a memory file that is an object with a field of the wrong type, on the real build. The server's own thunai folder is used (instance skeptic2b).
//   node tests/qa/pass4/skeptic-g2.memory.mjs [port] [instance]
import fs from "node:fs";
import path from "node:path";
import { login } from "./lib/access-lib.mjs";
const port = Number(process.argv[2] || 3216), inst = process.argv[3] || "skeptic2b", base = `http://127.0.0.1:${port}`;
const dir = path.join("data", "aws-cache", "qa", "srv", inst, "thunai");
const { cookie } = await login(base, "collector");
const H = { cookie, "content-type": "application/json" };
const post = (b) => fetch(base + "/api/collector/thunai/memory", { method: "POST", headers: H, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, t: (await r.text()).slice(0, 160) }));
const get = () => fetch(base + "/api/collector/thunai/memory", { headers: { cookie } }).then(async (r) => ({ s: r.status, t: (await r.text()).slice(0, 160) }));
console.log("first", JSON.stringify(await post({ op: "note", text: "first" })));
const f = fs.readdirSync(dir).find((x) => /^memory-\d+\.json$/.test(x));
const file = path.join(dir, f);
const orig = fs.readFileSync(file, "utf8");
console.log("file", f);
for (const bad of [{ notes: null, reminders: "x" }, { notes: "abc" }, { notes: { a: 1 } }]) {
  fs.writeFileSync(file, JSON.stringify(bad));
  console.log("BAD FILE", JSON.stringify(bad));
  console.log(" GET  ", JSON.stringify(await get()));
  console.log(" POST ", JSON.stringify(await post({ op: "note", text: "second" })));
  console.log(" after", fs.readFileSync(file, "utf8").slice(0, 120).replace(/\s+/g, " "), "| kept aside:", fs.readdirSync(dir).filter((x) => x.includes("damaged")).length);
}
fs.writeFileSync(file, orig);
for (const x of fs.readdirSync(dir)) if (x.includes("damaged") || x.endsWith(".tmp")) fs.rmSync(path.join(dir, x));
console.log("restored");
