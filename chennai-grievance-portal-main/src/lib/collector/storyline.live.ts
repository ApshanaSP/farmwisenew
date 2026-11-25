/** Writes the developing stories' timelines from the real news and prints them, with the alert lane and the Briefing's key points. Dry-run
 *  copy; spends from the shared Claude budget.
 *   NEWS_DESK_FILE=<file> npx vitest run --config vitest.live.config.ts src/lib/collector/storyline.live.ts */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
import { it } from "vitest";
import fs from "fs";
import { spentUsd } from "@/lib/ai/claudebudget";
import { dayBrief } from "./aibrief";
import { alertLane } from "./alerts";
import { asOf, periodSince } from "./intel";
import { stories } from "./storyai";

it("the developing stories on real news", async () => {
  const now = await asOf();
  const t0 = Date.now(), before = spentUsd();
  const scope = { hours: 24 * 7, zone: null, dept: null, cat: null, taluk: null };
  let s = await stories(scope, now, "probe@local");
  for (let k = 0; k < 60 && s.pending; k++) { await new Promise((r) => setTimeout(r, 3000)); s = await stories(scope, now, "probe@local"); }
  const out: string[] = [`now ${now}: ${s.total} stories, ai ${s.ai}, ${Math.round((Date.now() - t0) / 1000)} s, $${(spentUsd() - before).toFixed(4)}`];
  for (const x of s.threads) {
    out.push(`\n### ${x.title}  [${x.ai?.status ?? "rules"}] ${x.reports} reports, ${x.outlets.length} outlets, joined ${x.merged}`);
    if (x.ai) out.push(`   NOW: ${x.ai.now}`);
    for (const e of x.events) out.push(`   ${e.t.slice(5, 16)}  ${e.label} — ${e.what}  (${e.reports} reports: ${e.sources.map((o) => o.publisher).join(", ")})`);
  }
  const day = await stories({ ...scope, hours: 24, since: periodSince("daily", now) }, now, "probe@local");
  out.push(`\n== daily view: ${day.total}`, ...day.threads.map((x) => `  ${x.title} (${x.events.length} events from ${x.events[0].t.slice(0, 10)})`));
  const l = await alertLane(now);
  out.push(`\n== banner: ${JSON.stringify(l.banner)}\n   event ${JSON.stringify(l.event)}; ${l.status.reasons.join(" | ")}`);
  if (process.env.PROBE_BRIEF === "1") {
    const b = await dayBrief({ period: "daily", zone: null, dept: null, taluk: null }, "probe@local");
    out.push(`\n== key points: ${b?.headline}`, ...(b?.points ?? []).map((p) => `  [${p.topic}] ${p.text}`));
  }
  fs.writeFileSync(process.env.PROBE_OUT ?? "data/thunai-test-a/storyline.txt", out.join("\n"));
}, 900_000);
