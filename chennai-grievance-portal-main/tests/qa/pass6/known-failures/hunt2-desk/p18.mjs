import { call, P, j } from "./h.mjs";
const code = process.argv[2];
const c = await call(P, "collector", "GET", `/api/collector/incidents/INC-W-${code}`);
const t = c.text;
for (const needle of ["�", "\ud83d", "\uD83D"]) { const i = t.indexOf(needle); console.log(JSON.stringify(needle), i, i >= 0 ? JSON.stringify(t.slice(Math.max(0, i - 120), i + 40)) : ""); }
const m = t.match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/); if (m) console.log("lone at", m.index, JSON.stringify(t.slice(m.index - 80, m.index + 20)));
