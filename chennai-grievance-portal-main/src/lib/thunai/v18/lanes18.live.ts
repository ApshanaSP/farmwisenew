/**
 * v18 round 2 (24 Nov, the owner: "data should be the same throughout the website"): the same custom range counted by Jarvis (v18 window reads)
 * and by Ask District IQ / the officer's assistant (assistant/incidents.ts countIncidents over fastpath's customWindow), on a dry-run copy.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v18/lanes18.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
import { expect, it } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { customWindow } from "@/lib/assistant/fastpath";
import { countIncidents } from "@/lib/assistant/incidents";
import { readPeriod } from "@/lib/period/read";
import { winIncidents } from "./window";
import { turnWhen, windowOf } from "./when";

const NONE = { zone: null, zones: null, place: null, dept: null, cats: null, sev: null, taluk: null, status: null };

it("a custom range is the same number in Jarvis and in Ask District IQ", async () => {
  const now = await asOf();
  const asks: { text: string; dept: string | null; zone: number | null }[] = [
    { text: "from 1st November to 15th November", dept: "POL-GCP", zone: null },
    { text: "from 1st November to 15th November", dept: null, zone: null },
    { text: "between 10 October and 20 October", dept: null, zone: 13 },
    { text: "on 20 November", dept: null, zone: null },
    { text: "yesterday", dept: "POL-GCP", zone: null }];
  const diffs: string[] = [];
  for (const a of asks) {
    const spec = turnWhen(a.text, null, now);
    const w = windowOf(spec, "weekly", now);
    const cw = customWindow(a.text, now);
    const [mine, theirs] = await Promise.all([
      winIncidents(w, { ...NONE, dept: a.dept, zone: a.zone }, 3),
      cw?.range ? countIncidents({ period: cw.period, dept: a.dept, zone: a.zone, range: cw.range }, now) : Promise.resolve(null)]);
    const row = { text: a.text, dept: a.dept, zone: a.zone, jarvis: { from: w.from, to: w.to, n: mine.n, severe: mine.severe }, chat: cw?.range ? { ...cw.range, n: theirs?.n, severe: theirs?.severe } : null, spec: readPeriod(a.text).kind };
    console.log(JSON.stringify(row));
    if (theirs && (mine.n !== theirs.n || mine.severe !== theirs.severe)) diffs.push(`${a.text} ${a.dept ?? ""} ${a.zone ?? ""}: jarvis ${mine.n}/${mine.severe} vs chat ${theirs.n}/${theirs.severe}`);
  }
  console.log(diffs.length ? `DIFFERENCES:\n${diffs.join("\n")}` : "all equal");
  expect(diffs).toEqual([]);
}, 300_000);
