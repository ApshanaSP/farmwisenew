/**
 * One or more tools run on a dry-run copy of the store, with no model: what the brain would read.
 *   PROBE='[["incidents",{"group_by":["zone"]}]]' npx vitest run --config vitest.live.config.ts src/lib/brain/eval/probe.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.AI_PROVIDER = "none";
import fs from "node:fs";
import { it } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { serverWorld } from "@/lib/thunai/world";
import { fitInput } from "../fit";
import { outText } from "../format";
import { TOOLS } from "../tools";

it("the tools, read", async () => {
  const world = await serverWorld();
  const now = await asOf();
  const jobs = JSON.parse(process.env.PROBE_FILE ? fs.readFileSync(process.env.PROBE_FILE, "utf8") : process.env.PROBE ?? "[]") as [string, Record<string, unknown>][];
  const ctx = { user: { email: "collector@chennai.gov.in", role: "collector" as const, lockDept: null }, world, now, turn: [], past: [], console: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, incident: null }, channel: "voice" as const };
  for (const [name, input] of jobs) {
    const t = TOOLS.find((x) => x.name === name)!, t0 = Date.now();
    try {
      const out = await t.run(fitInput(t, input), ctx as never);
      console.log(`== ${name} ${JSON.stringify(input)} ${Date.now() - t0} ms\n${outText("r1", out, 40).slice(0, Number(process.env.PROBE_CHARS ?? 5000))}`);
    } catch (e) { console.log(`== ${name} ${JSON.stringify(input)} FAILED: ${(e as Error).message}`); }
  }
}, 600_000);
