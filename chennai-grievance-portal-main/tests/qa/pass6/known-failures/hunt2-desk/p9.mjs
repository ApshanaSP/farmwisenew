import { call, P, j } from "./h.mjs";
const [who, url] = [process.argv[2], "/" + process.argv[3]];
const r = await call(P, who, "GET", url, who && who.startsWith("citizen") ? { headers: { referer: "http://127.0.0.1:3106/citizen" } } : {});
const t = r.text;
console.log(r.status, t.length, "raw2345:", (t.match(/2345/g) || []).length, "tamil:", (t.match(/௨௩௪௫/g) || []).length, "XXXX:", (t.match(/XXXX/g) || []).length, "98400 11111:", (t.match(/98400 11111/g)||[]).length);
console.log(t.slice(0, +process.argv[4] || 1500));
