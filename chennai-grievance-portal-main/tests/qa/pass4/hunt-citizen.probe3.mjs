import { login, req } from "./lib/access-lib.mjs";
const base = `http://127.0.0.1:${process.argv[2] || 3175}`;
const C = await login(base, "collector");
const l = JSON.parse((await req(base, "GET", "/api/collector/studio", { cookie: C.cookie })).text);
for (const d of l.datasets.filter(d=>/future|tamil-bom/.test(d.file))) {
  const j = JSON.parse((await req(base, "GET", "/api/collector/studio/" + d.id, { cookie: C.cookie })).text);
  console.log("==", d.file, "health", d.health);
  console.log("alerts", JSON.stringify(j.alerts));
  console.log("brief", JSON.stringify(j.brief).slice(0,900));
  console.log("focus", JSON.stringify(j.focus).slice(0,500));
  console.log("meta extras", JSON.stringify(Object.fromEntries(Object.entries(j.meta).filter(([k])=>!["spec","profile","source"].includes(k)))).slice(0,800));
  console.log("panels", JSON.stringify(j.panels).slice(0,700));
}
