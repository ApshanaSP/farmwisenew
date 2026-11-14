import { localOnly } from "@/lib/thunai/devguard";
import { NextRequest, NextResponse } from "next/server";
import { buildBrief, standingNow } from "@/lib/thunai/briefing";
import { buildSignals, conditionsOf, loadWatchInput } from "@/lib/thunai/signals";
import { redact } from "@/lib/thunai/privacy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev console's brief: the same code on the local store, no sign-in, nothing written. 404 in production. */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  try {
    const [input, standing] = await Promise.all([loadWatchInput([]), standingNow()]);
    return NextResponse.json(buildBrief(redact(buildSignals(input)), { ...standing, conditions: redact(conditionsOf(input)) }, input.asOf));
  } catch (e) {
    console.error("thunai dev brief failed", e);
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
