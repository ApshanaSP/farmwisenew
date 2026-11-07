import { login, req } from "./lib/access-lib.mjs";
const base = `http://127.0.0.1:${process.argv[2] || 3175}`;
const C = await login(base, "collector");
const l = JSON.parse((await req(base, "GET", "/api/collector/studio", { cookie: C.cookie })).text);
for (const d of l.datasets) {
  console.log("==", d.id, d.file, d.rows, d.health);
  const r = await req(base, "GET", "/api/collector/studio/" + d.id, { cookie: C.cookie });
  const j = JSON.parse(r.text);
  console.log(Object.keys(j).join(","));
  console.log(JSON.stringify(j).slice(0, 1800));
}
