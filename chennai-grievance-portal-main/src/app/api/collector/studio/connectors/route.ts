import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { note } from "@/lib/studio/http";
import { approveProposal, deleteConnector, getConnector, judgeQuarantine, listConnectors, readSource, runConnector, setPaused, setSchedule, type Connector } from "@/lib/studio/connectors";
import { connectorRuntime, keepUpdated } from "@/lib/studio/pipeline";
import { getMeta, validId } from "@/lib/studio/store";
import { UserError } from "@/lib/studio/parse";
import { getVault } from "@/lib/studio/connect/vault";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A connector as the page shows it: no tables, the last 60 runs. */
const view = (c: Connector) => ({ ...c, history: c.history.slice(0, 60), dataset: getMeta(c.id)?.name ?? c.name });

/** The Live Connectors: the list, with each one's health. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    const list = listConnectors().map(view).sort((a, b) => a.dataset.localeCompare(b.dataset));
    const attention = list.filter((c) => c.status !== "healthy" && c.status !== "paused").length;
    return NextResponse.json({ connectors: list, attention, note: "Connectors run while District IQ's server is running." });
  } catch (err) {
    return failed(err, "the connectors");
  }
}

const Every = z.enum(["hourly", "daily", "weekly"]);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id: z.string(), every: Every.optional(), at: z.string().regex(/^\d{2}:\d{2}$/).optional(), tolerance: z.number().int().min(0).max(10080).optional(),
    mode: z.enum(["replace", "append", "snapshots"]).optional(), pattern: z.string().max(300).optional().nullable(), retention: z.number().int().min(1).max(3650).optional() }),
  z.object({ action: z.enum(["run", "pause", "resume", "approve", "approveNew", "accept", "reject", "delete"]), id: z.string() }),
  z.object({ action: z.literal("schedule"), id: z.string(), every: Every.optional(), at: z.string().regex(/^\d{2}:\d{2}$/).optional(), tolerance: z.number().int().min(0).max(10080).optional(),
    mode: z.enum(["replace", "append", "snapshots"]).optional(), retention: z.number().int().min(1).max(3650).optional() }),
  z.object({ action: z.literal("backfill"), id: z.string(), days: z.number().int().min(1).max(30) })
]);

/** Create, run now, pause / resume, edit the schedule, answer a self-heal proposal or a quarantine, backfill, delete. */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success || !validId(b.data.id)) return NextResponse.json({ error: "Unknown connector action." }, { status: 400 });
  const a = b.data;
  try {
    const deps = connectorRuntime();
    if (a.action === "create") {
      const c = await keepUpdated(a.id, { every: a.every, at: a.at, tolerance: a.tolerance, mode: a.mode, pattern: a.pattern ?? undefined, retention: a.retention });
      await note(s.email, "studio:connector", a.id, { create: true, every: c.schedule.every, at: c.schedule.at, mode: c.mode });
      return NextResponse.json({ connector: view(c) });
    }
    if (!getConnector(a.id)) return NextResponse.json({ error: "This dataset has no connector." }, { status: 404 });
    let run = null;
    switch (a.action) {
      case "run": run = await runConnector(a.id, deps, { manual: true }); break;
      case "pause": setPaused(a.id, true); break;
      case "resume": setPaused(a.id, false); break;
      case "approve": run = await approveProposal(a.id, deps); break;
      case "approveNew": run = await approveProposal(a.id, deps, true); break;
      case "accept": run = await judgeQuarantine(a.id, deps, true); break;
      case "reject": run = await judgeQuarantine(a.id, deps, false); break;
      case "schedule": setSchedule(a.id, { every: a.every, at: a.at, tolerance: a.tolerance, mode: a.mode, retention: a.retention }); break;
      case "backfill": {
        const c = getConnector(a.id)!;
        if (c.locate !== "newest-file-matching") return NextResponse.json({ error: "Only a connector that reads dated files can fill in past days." }, { status: 400 });
        // the past days' files, read politely (one a second), then applied like a run
        const got = await readSource(c, getVault(a.id)?.auth ?? { mode: "none" }, { backfillDays: a.days });
        run = await runConnector(a.id, { ...deps, read: async () => got }, { manual: true });
        break;
      }
      case "delete": deleteConnector(a.id); break;
    }
    await note(s.email, "studio:connector", a.id, { action: a.action });
    const c = getConnector(a.id);
    return NextResponse.json({ connector: c ? view(c) : null, run });
  } catch (err) {
    // a plain reason the Collector can act on ("already kept up to date", "nothing in quarantine") is said as it is
    if (err instanceof UserError || /^(No proposal|Nothing is in quarantine|Unknown connector|Only )/.test((err as Error).message)) return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    return failed(err, "the connector");
  }
}
