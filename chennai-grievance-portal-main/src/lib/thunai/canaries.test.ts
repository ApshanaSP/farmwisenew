import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { briefTurn, resolveEntity } from "./entities";

// tests/qa/canaries.jsonl was written blind (by an agent that saw no code) after the police fix: loose phrasings of the other bodies.
// No alias was added for them. Target: at least 90 % reach the right body (or an honest "no data" for the fire service).
const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const rows = fs.readFileSync(path.join(process.cwd(), "tests", "qa", "canaries.jsonl"), "utf8").trim().split(/\r?\n/).map((l) => JSON.parse(l) as { text: string; lang: string; expect: string });

export function canaryGot(text: string): string {
  const t = briefTurn(text, world);
  if (t?.kind === "reply") return "unknown";
  if (t?.kind === "screen") { const s = t.slots as { dept?: string; org?: string; zones?: number[] }; return s.dept ?? s.org ?? (s.zones?.length ? `ZONE-${s.zones[0]}` : "none"); }
  const r = resolveEntity(text, world);
  return t?.kind === "clarify" ? `clarify:${r.kind === "entity" ? r.entity.id : r.kind}` : `none:${r.brief ? "brief" : "nobrief"}:${r.kind === "entity" ? r.entity.id : r.kind}`;
}

it("the generality canaries reach the right body", () => {
  const out = rows.map((r) => ({ ...r, got: canaryGot(r.text) }));
  const right = out.filter((r) => r.got === r.expect).length;
  fs.mkdirSync(path.join(process.cwd(), "eval", "holdout", "results"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "eval", "holdout", "results", "qa-canaries.json"), JSON.stringify({ at: new Date().toISOString(), right, n: out.length, rows: out }, null, 1));
  console.log("CANARY", right, "/", out.length);
  for (const r of out.filter((x) => x.got !== x.expect)) console.log("MISS", r.expect, "<-", r.got, "|", r.text);
  expect(right / out.length).toBeGreaterThanOrEqual(0.9);
});
