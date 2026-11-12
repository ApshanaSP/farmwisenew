import { call } from "../../lib/live.mjs";
const [who, m, path, grep] = process.argv.slice(2);
const r = await call(3106, who === "anon" ? null : who, m, path);
console.log(r.status, r.text.length);
const t = r.text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
console.log(grep ? (t.match(new RegExp(".{0,80}" + grep + ".{0,80}", "gi")) || []).slice(0,5) : t.slice(0, 600));
