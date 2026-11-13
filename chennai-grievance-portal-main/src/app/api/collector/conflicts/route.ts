import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { asOf, parsePeriod } from "@/lib/collector/intel";
import { periodConflicts, storyConflicts } from "@/lib/collector/conflicts";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

/**
 * Where news reports of the same event disagree (conflicts.ts).
 * GET ?period=daily: every story of the period whose outlets disagree.
 * GET ?ids=DOC-1,DOC-2&title=...&id=DOC-1: one story's reports (the news preview, the incident pop-up).
 * No period means daily; a period the console does not know is a 400 (pass 4 RC-43), never read as daily.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  try {
    const ids = (p.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (ids.length) {
      if (ids.length > 60 || ids.some((x) => !/^[A-Za-z0-9_:.-]{1,80}$/.test(x))) return NextResponse.json({ error: "Invalid report ids." }, { status: 400 });
      const id = p.get("id");
      return NextResponse.json({ story: await storyConflicts(ids, String(p.get("title") ?? "").slice(0, 200), s.email, id && /^[A-Za-z0-9_:.-]{1,80}$/.test(id) ? id : undefined) });
    }
    return NextResponse.json(await periodConflicts(parsePeriod(p.get("period")), await asOf(), s.email));
  } catch (err) {
    return failed(err, "the news conflict check");
  }
}
