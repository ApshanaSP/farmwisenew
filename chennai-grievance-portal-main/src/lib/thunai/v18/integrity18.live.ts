/**
 * v18 round 2 (24 Nov, the owner: "there should be no hallucination in numbers; data should be the same throughout the website"): the summary's
 * figures against the console's own tiles (intel.ts kpiBlock, read through Ask District IQ's overview_kpis tool) and its zone table, for the
 * same windows, on a dry-run copy of the store. Fails on any difference.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v18/integrity18.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
import { expect, it } from "vitest";
import { runTool } from "@/lib/assistant/tools";
import { asOf } from "@/lib/collector/intel";
import { winIncidents } from "./window";
import { windowOf } from "./when";

const NONE = { zone: null, zones: null, place: null, dept: null, cats: null, sev: null, taluk: null, status: null };

it("the summary's figures are the console's", async () => {
  const now = await asOf();
  const cases: { period: "daily" | "weekly" | "monthly" | "quarterly"; zone: number | null; dept: string | null }[] = [
    { period: "daily", zone: null, dept: null }, { period: "weekly", zone: null, dept: null }, { period: "monthly", zone: 8, dept: null },
    { period: "weekly", zone: null, dept: "POL-GCP" }, { period: "quarterly", zone: 13, dept: null }];
  const diffs: string[] = [];
  for (const c of cases) {
    const w = windowOf(null, c.period, now);
    const [mine, tiles, zones] = await Promise.all([
      winIncidents(w, { ...NONE, zone: c.zone, dept: c.dept }, 3),
      runTool("overview_kpis", { scope: { period: c.period, zone: c.zone, dept: c.dept } }),
      runTool("zones", { scope: { period: c.period, dept: c.dept } })
    ]);
    const cur = (tiles.data as { cur: Record<string, number> }).cur;
    const prev = (tiles.data as { prev?: Record<string, number> }).prev ?? {};
    const pairs: [string, number, number][] = [["severe events", mine.severe, cur.severe], ["ongoing incidents", mine.open, cur.ongoing],
      ["open citizen complaints", mine.complaints, cur.complaints], ["resolved", mine.resolved, cur.resolved], ["reported", mine.n, cur.reported],
      // (round 2 review: the window before, as the console counts its previous period)
      ["reported, the window before", mine.prev, prev.reported], ["severe, the window before", mine.prevSevere, prev.severe]];
    if (c.zone) {
      const z = ((zones.data as { rows: Record<string, number>[] }).rows ?? []).find((r) => Number(r.zone) === c.zone);
      if (z) pairs.push(["zone table: incidents", mine.n, Number(z.n ?? z.incidents)], ["zone table: severe", mine.severe, Number(z.severe)]);
    }
    for (const [what, a, b] of pairs) if (a !== b) diffs.push(`${c.period} zone=${c.zone ?? "-"} dept=${c.dept ?? "-"}: ${what} summary ${a} vs console ${b}`);
    console.log(JSON.stringify({ ...c, pairs }));
  }
  console.log(diffs.length ? `DIFFERENCES:\n${diffs.join("\n")}` : "all equal");
  expect(diffs).toEqual([]);
}, 300_000);
