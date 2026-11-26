import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { asOf, parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { periodConflicts, storyConflicts } from "@/lib/collector/conflicts";
import { anyFilter, conflictScope } from "@/lib/collector/conflictscope";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

/**
 * Where news reports of the same event disagree (conflicts.ts).
 * GET ?period=daily: every story of the period whose outlets disagree. With zone, dept, cat or taluk, `scope` also says which of them
 * are linked to an incident inside the filters and which have no incident on record (conflictscope.ts).
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
    const all = await periodConflicts(parsePeriod(p.get("period")), await asOf(), s.email);
    const f = { zone: parseZone(p.get("zone")), dept: parseDept(p.get("dept")), cat: parseCat(p.get("cat")), taluk: parseTaluk(p.get("taluk")) };
    return NextResponse.json(anyFilter(f) ? { ...all, scope: await conflictScope(all.stories, f) } : all);
  } catch (err) {
    return failed(err, "the news conflict check");
  }
}
