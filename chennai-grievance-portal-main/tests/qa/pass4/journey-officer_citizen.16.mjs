// officer queue API: does it contain the complaint the citizen just filed? (uses saved officer cookie, no new sign-in)
import fs from "node:fs";
const st = JSON.parse(fs.readFileSync("../.qa-officer-state.json", "utf8"));
const cookie = st.cookies.map((c) => c.name + "=" + c.value).join("; ");
const base = "http://localhost:3182";
for (const q of ["", "?status=pending", "?stage=new", "?q=993UJN", "?search=993UJN"]) {
  const r = await fetch(base + "/api/officer/grievances" + q, { headers: { cookie, referer: base + "/officer" } });
  const t = await r.text();
  console.log(q || "(none)", r.status, t.length, "has993UJN=", t.includes("993UJN"), "hasGandhiNagar2nd=", t.includes("Gandhi Nagar 2nd"), t.slice(0, 160).replace(/\s+/g, " "));
}
