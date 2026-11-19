import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { briefFor } from "@/lib/thunai/briefing";
import { followedNow, followsTold } from "@/lib/thunai/signals";
import { changeMemory, readMemory } from "@/lib/thunai/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The Collector's brief (lib/thunai/briefing.ts), on power-on and on "brief me": the bottom line, three to five items with their
 * source chips, and the end line; the items for a card and the spoken lines in English and Tamil, every figure from code and every
 * line through the number gate. The signals it tells are noted as told, so the watch does not interject them again; a followed change
 * it tells is marked seen too (its state now is what the next change is measured from), as the card's followSeen does.
 */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-brief:${s.userId}`, 12, 60);
  if (!gate.allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  try {
    const brief = await briefFor(s.userId);
    try { if (brief.told.length) changeMemory(s.userId, { op: "watchSeen", items: brief.told, told: true }); } catch { /* the brief still answers */ }
    try {
      const told = followsTold(brief.told.map((x) => x.key), readMemory(s.userId).follows ?? []);
      if (told.length) {
        const snaps = await followedNow(told);
        told.forEach((f, i) => { const snap = snaps[i]; if (snap) changeMemory(s.userId, { op: "followSeen", id: f.id, snap }); });
      }
    } catch { /* a follow left unmarked is told again later: the brief still answers */ }
    return NextResponse.json(brief);
  } catch (err) {
    return failed(err, "Jarvis's brief");
  }
}
