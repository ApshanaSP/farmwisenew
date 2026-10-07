import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { analyseStory } from "@/lib/collector/analysis";

export const dynamic = "force-dynamic";

/** GET ?ids=DOC-1,DOC-2: what the story is and why it matters to the Collector, analysed by AI from every outlet's report. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.length || ids.length > 60 || ids.some((x) => !/^[A-Za-z0-9_:.-]{1,80}$/.test(x))) {
    return NextResponse.json({ error: "Invalid report ids." }, { status: 400 });
  }
  try {
    return NextResponse.json({ analysis: await analyseStory(ids, s.email) });
  } catch (err) {
    return failed(err, "the analysis");
  }
}
