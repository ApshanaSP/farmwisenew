import { call, P, j } from "./h.mjs";
const [who, id] = [process.argv[2], process.argv[3]];
const r = await call(P, who, "GET", `/api/officer/grievances/${id}`);
const t = r.text;
console.log(r.status, t.length);
for (const pat of [/2345/g, /௨௩௪௫/g, /XXXX/g, /6789/g]) console.log(pat, (t.match(pat) || []).length);
console.log(t.slice(0, 2500));
