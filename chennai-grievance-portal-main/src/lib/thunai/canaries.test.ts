import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { briefTurn, resolveEntity } from "./entities";

// tests/qa/canaries.jsonl was written blind (by an agent that saw no code) after the police fix: loose phrasings of the other bodies.
// No alias was added for them. Target: at least 90 % reach the right body (or an honest "no data" for the fire service).
import zlib from "zlib";
// the world as the server builds it: the console's departments, plus every body in the cached reference table (serverWorld's bodyList)
const refDepts = (() => {
  const dir = path.join(process.cwd(), "data", "aws-cache");
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((x) => x.startsWith("ref_departments-")) : null;
  if (!f) return [];
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8")) as { rows: unknown[][] };
  return j.rows.map((r) => ({ code: String(r[0]), name: String(r[1]) }));
})();
const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts, bodies: refDepts };
const rows = fs.readFileSync(path.join(process.cwd(), "tests", "qa", "canaries.jsonl"), "utf8").trim().split(/\r?\n/).map((l) => JSON.parse(l) as { text: string; lang: string; expect: string });

export function canaryGot(text: string): string {
  const t = briefTurn(text, world);
  // "no records from TANGEDCO yet" resolved the body; only an honest "no data on X" is unknown
  if (t?.kind === "reply") return t.entity ?? "unknown";
  if (t?.kind === "screen") { const s = t.slots as { dept?: string; org?: string; zones?: number[] }; return s.dept ?? s.org ?? (s.zones?.length ? `ZONE-${s.zones[0]}` : "none"); }
  const r = resolveEntity(text, world);
  return t?.kind === "clarify" ? `clarify:${r.kind === "entity" ? r.entity.id : r.kind}` : `none:${r.brief ? "brief" : "nobrief"}:${r.kind === "entity" ? r.entity.id : r.kind}`;
}

it("the generality canaries reach the right body", () => {
  const out = rows.map((r) => ({ ...r, got: canaryGot(r.text) }));
  const right = out.filter((r) => r.got === r.expect).length;
  if (process.env.QA_WRITE === "1") fs.writeFileSync(path.join(process.cwd(), "eval", "holdout", "results", "qa-canaries.json"), JSON.stringify({ at: new Date().toISOString(), right, n: out.length, rows: out }, null, 1));
  console.log("CANARY", right, "/", out.length);
  for (const r of out.filter((x) => x.got !== x.expect)) console.log("MISS", r.expect, "<-", r.got, "|", r.text);
  expect(right / out.length).toBeGreaterThanOrEqual(0.9);
});

it("a body in the reference table with no records gets an honest 'no records yet'", () => {
  const t = briefTurn("TANGEDCO status", world);
  expect(t?.kind).toBe("reply");
  expect(t && "entity" in t ? t.entity : null).toBe("TANGEDCO");
  expect(t?.kind === "reply" ? t.text.en : "").toMatch(/has no records in this data yet/);
});
