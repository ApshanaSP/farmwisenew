import { call } from "../../lib/live.mjs";
const [who, msg, dept] = process.argv.slice(2);
const r = await call(3106, who, "POST", "/api/collector/assistant/chat", { body: { message: msg, consoleScope: { period: "monthly", zone: null, dept: dept || null, cat: null, taluk: null } } });
console.log(r.status);
for (const line of r.text.split("\n")) if (line.startsWith("data:") || line.startsWith("event:")) console.log(line.slice(0, 900));
