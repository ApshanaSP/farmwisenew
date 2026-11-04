import { NextRequest, NextResponse } from "next/server";
import { exportMeta } from "@/lib/collector/intel";
import { serverHands } from "@/lib/thunai/data";
import { planRound, RoundBody } from "@/lib/thunai/round";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev test console's rounds: the same code on the local store, no sign-in. 404 in production. */
export async function POST(req: NextRequest) {
  // a measuring build (NEXT_PUBLIC_JARVIS_SPEC=1 at build time) keeps these; a normal production build does not
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  const parsed = RoundBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ done: true, result: { kind: "none" }, why: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  try {
    return NextResponse.json(await planRound(parsed.data, await serverWorld(), serverHands({ email: "dev:thunai", role: "collector", lockDept: null }, req.signal), "dev:thunai", { notes: [], habits: {} }, req.signal, { dataVersion: () => exportMeta().then((m) => m.build_id ?? m.exported_at ?? "") }));
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    console.error("thunai dev round failed", e);
    return NextResponse.json({ done: true, result: { kind: "none", note: "failed" }, why: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
