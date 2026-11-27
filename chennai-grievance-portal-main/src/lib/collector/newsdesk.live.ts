/** Runs the news desk on the real news of the last DESK_DAYS days and prints every verdict. Dry-run copy; spends from the shared Claude budget.
 *   NEWS_DESK_FILE=<file> DESK_DAYS=2 npx vitest run --config vitest.live.config.ts src/lib/collector/newsdesk.live.ts
 * DESK_CASES=<file>: also judges these stories ([{ id, story: DeskStory }], e.g. the news-only incidents the word rules took out) and prints their kinds. */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
import { it } from "vitest";
import fs from "fs";
import { asOf, newsLeftOut, newsStories } from "./intel";
import { deskBook, deskInfo, deskKey, deskOf, judge, saveDesk, sweep, type DeskStory } from "./newsdesk";
import { spentUsd } from "@/lib/ai/claudebudget";

it("the news desk on real news", async () => {
  const now = await asOf();
  const days = Number(process.env.DESK_DAYS || 2);
  const before = spentUsd(), t0 = Date.now();
  const n = await sweep(days, now, Number(process.env.DESK_BATCHES || 40));
  const out: string[] = [`now ${now}; judged ${n} in ${Math.round((Date.now() - t0) / 1000)} s; cost $${(spentUsd() - before).toFixed(4)}; ${JSON.stringify(deskInfo())}`];
  if (process.env.DESK_CASES) {
    const cases = JSON.parse(fs.readFileSync(process.env.DESK_CASES, "utf8")) as { id: string; story: DeskStory }[];
    const c0 = spentUsd();
    out.push(`== ${cases.length} cases`);
    for (let k = 0; k < cases.length; k += 12) {
      const batch = cases.slice(k, k + 12);
      const got = await judge(batch.map((x) => x.story));
      for (const [i, v] of got) {
        for (const t of batch[i].story.titles) deskBook().set(deskKey(t), v);
        out.push(`${batch[i].id} [${v.kind ?? "??"}|${v.v}|${v.area || v.skip}|real=${v.real}] ${batch[i].story.title.slice(0, 120)}\n      head: ${v.head}`);
      }
      if (k + 12 < cases.length) await new Promise((r) => setTimeout(r, 4000));
    }
    saveDesk();
    out.push(`cases cost $${(spentUsd() - c0).toFixed(4)}`);
  }
  for (const p of ["daily", "weekly"] as const) {
    const s = await newsStories(p, now);
    out.push(`== ${p}: ${s.length} kept`);
    for (const x of s) out.push(`[${x.desk?.v ?? "??"}|${deskOf(x.title)?.kind ?? ""}|${x.desk?.area ?? ""}|${x.desk?.cat ?? ""}] ${x.t.slice(5, 16)} ${x.outletNames.join(", ")} | ${x.title}\n      gist: ${x.desk?.gist ?? ""}\n      why: ${x.desk?.why ?? ""}`);
    const l = await newsLeftOut(p, now);
    out.push(`== ${p}: ${l.total} left out`);
    for (const x of l.items) out.push(`(${x.reason}) ${x.t.slice(5, 16)} ${x.publisher} | ${x.title}`);
  }
  out.push(`total cost $${(spentUsd() - before).toFixed(4)}`);
  fs.writeFileSync(process.env.PROBE_OUT ?? "data/thunai-test-a/newsdesk.txt", out.join("\n"));
  await new Promise((r) => setTimeout(r, 1500));
}, 3_000_000);
