import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { RehearsalUnavailable, rehearsalState } from "@/lib/rehearsal/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Rain Rehearsal for the Collector: the whole map, panel and plan for now (or a replay of a past rain). Polled every
 * minute while open; an unchanged answer returns 304 against its ETag.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const replay = p.get("replay");
  if (replay && !/^rain-\d{4}-\d{2}-\d{2}$/.test(replay)) return NextResponse.json({ error: "No such rain." }, { status: 400 });
  try {
    const state = await rehearsalState({ replay, manual: p.get("manual") === "1", tHelp: Number(p.get("t")) || undefined });
    const { ms, ...rest } = state;
    const body = JSON.stringify(state);
    const tag = `"${createHash("sha1").update(JSON.stringify(rest)).digest("hex").slice(0, 20)}"`;
    if (req.headers.get("if-none-match") === tag) return new NextResponse(null, { status: 304, headers: { ETag: tag } });
    return new NextResponse(body, { status: 200, headers: { "content-type": "application/json", ETag: tag, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return failed(e, "the rain rehearsal");
  }
}
