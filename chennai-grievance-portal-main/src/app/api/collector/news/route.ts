import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { refuseBadFilter } from "@/lib/collector/filters";
import { asOf, newsArticles, newsLeftOut, parsePeriod, storyDept } from "@/lib/collector/intel";

export const dynamic = "force-dynamic";

/**
 * GET ?ids=DOC-1,DOC-2: the reports of one news story, for the news preview, and the department that handles what it is about.
 * GET ?left=1&period=daily: what the news desk left out of the period's news, each with its reason.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (req.nextUrl.searchParams.get("left") === "1") {
    const bad = refuseBadFilter(req.nextUrl.searchParams);
    if (bad) return bad;
    try {
      return NextResponse.json(await newsLeftOut(parsePeriod(req.nextUrl.searchParams.get("period")), await asOf()), { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      return failed(err, "the news left out");
    }
  }
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.length || ids.length > 60 || ids.some((x) => !/^[A-Za-z0-9_:.-]{1,80}$/.test(x))) {
    return NextResponse.json({ error: "Invalid report ids." }, { status: 400 });
  }
  try {
    const articles = await newsArticles(ids);
    return NextResponse.json({ articles, dept: await storyDept(articles.map((x) => (x as Record<string, unknown>).cat as string | null), articles as unknown as { title: string; title_en?: string | null }[]) });
  } catch (err) {
    return failed(err, "the news reports");
  }
}
