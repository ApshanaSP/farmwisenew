/** Runs the news desk on the real news of the last DESK_DAYS days and prints every verdict. Dry-run copy; spends from the shared Claude budget.
 *   NEWS_DESK_FILE=<file> DESK_DAYS=2 npx vitest run --config vitest.live.config.ts src/lib/collector/newsdesk.live.ts */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
import { it } from "vitest";
import fs from "fs";
import { asOf, newsLeftOut, newsStories } from "./intel";
import { deskInfo, sweep } from "./newsdesk";
import { spentUsd } from "@/lib/ai/claudebudget";

it("the news desk on real news", async () => {
  const now = await asOf();
  const days = Number(process.env.DESK_DAYS || 2);
  const before = spentUsd(), t0 = Date.now();
  const n = await sweep(days, now, Number(process.env.DESK_BATCHES || 40));
  const out: string[] = [`now ${now}; judged ${n} in ${Math.round((Date.now() - t0) / 1000)} s; cost $${(spentUsd() - before).toFixed(4)}; ${JSON.stringify(deskInfo())}`];
  for (const p of ["daily", "weekly"] as const) {
    const s = await newsStories(p, now);
    out.push(`== ${p}: ${s.length} kept`);
    for (const x of s) out.push(`[${x.desk?.v ?? "??"}|${x.desk?.area ?? ""}|${x.desk?.cat ?? ""}] ${x.t.slice(5, 16)} ${x.outletNames.join(", ")} | ${x.title}\n      gist: ${x.desk?.gist ?? ""}\n      why: ${x.desk?.why ?? ""}`);
    const l = await newsLeftOut(p, now);
    out.push(`== ${p}: ${l.total} left out`);
    for (const x of l.items) out.push(`(${x.reason}) ${x.t.slice(5, 16)} ${x.publisher} | ${x.title}`);
  }
  fs.writeFileSync(process.env.PROBE_OUT ?? "data/thunai-test-a/newsdesk.txt", out.join("\n"));
  await new Promise((r) => setTimeout(r, 1500));
}, 3_000_000);
