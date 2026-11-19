import { localOnly } from "@/lib/thunai/devguard";
import { NextRequest, NextResponse } from "next/server";
import { buildSignals, loadWatchInput } from "@/lib/thunai/signals";
import { redact } from "@/lib/thunai/privacy";
import { INTERJECT, emptyWatch, planWatch } from "@/lib/thunai/watch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev console's watch: the same signals on the local store, no sign-in, no follows and nothing written. 404 in production. */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  try {
    const input = await loadWatchInput([]);
    const signals = redact(buildSignals(input));
    const plan = planWatch(signals, { now: Date.now(), collectorSpeaking: false, turnInFlight: false, lastUserSpeech: null, quiet: false, watch: emptyWatch() });
    return NextResponse.json({ asOf: input.asOf, signals, queue: plan.queue.map((x) => x.key), badge: plan.badge, candidate: plan.interject, why: plan.why, policy: INTERJECT });
  } catch (e) {
    console.error("thunai dev watch failed", e);
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
