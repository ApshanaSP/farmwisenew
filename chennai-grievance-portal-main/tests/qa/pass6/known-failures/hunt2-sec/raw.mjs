import { call } from "../../lib/live.mjs";
const [who, m, path, grep, n] = process.argv.slice(2);
const r = await call(3106, who === "anon" ? null : who, m, path);
console.log(r.status, r.text.length);
const t = r.text;
console.log((t.match(new RegExp(".{0,100}(" + grep + ").{0,100}", "gi")) || []).slice(0, +(n||5)));
