import { districtSnapshot } from "@/lib/thunai/v11/snapshot";
import { claudeConfigured } from "@/lib/ai/claude";
import { localOnly } from "@/lib/thunai/devguard";
import { NextRequest, NextResponse } from "next/server";
import { exportMeta } from "@/lib/collector/intel";
import { serverHands } from "@/lib/thunai/data";
import type { TurnEvent } from "@/lib/thunai/events";
import { planRound, RoundBody } from "@/lib/thunai/round";
import { roundStream } from "@/lib/thunai/streamturn";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev test console's rounds: the same code on the local store, no sign-in. 404 in production. `stream: true` answers NDJSON. */
export async function POST(req: NextRequest) {
  // a measuring build (NEXT_PUBLIC_JARVIS_SPEC=1 at build time) keeps these; a normal production build does not
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  const parsed = RoundBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ done: true, result: { kind: "none" }, why: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  // v12 (21 Nov, first-question RC3): THE DISTRICT NOW is read only when Claude can lead, as on the Collector's route (round.ts also reads it
  // only when Claude leads; this keeps the dev console and the probes from reading it for nothing)
  const snapshot = () => (claudeConfigured() ? districtSnapshot() : Promise.resolve(null));
  const run = async (emit?: (e: TurnEvent) => void) => planRound(parsed.data, await serverWorld(), serverHands({ email: "dev:thunai", role: "collector", lockDept: null }, req.signal), "dev:thunai", { notes: [], habits: {} }, req.signal,
    { dataVersion: () => exportMeta().then((m) => m.build_id ?? m.exported_at ?? ""), speculate: true, emit, snapshot });
  if (parsed.data.stream) return roundStream(run, { turnId: parsed.data.turnId, round: parsed.data.round }, req.signal);
  try {
    return NextResponse.json(await run());
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    console.error("thunai dev round failed", e);
    return NextResponse.json({ done: true, result: { kind: "none", note: "failed" }, why: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
