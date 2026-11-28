import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { NO_AI_WORDS, storyAnalysis } from "@/lib/collector/analysis";

export const dynamic = "force-dynamic";

/**
 * GET ?ids=DOC-1,DOC-2: what the story is and why it matters to the Collector, analysed by AI from every outlet's report. `noAi`: the one
 * line the panel shows under the news desk's text when there is no AI answer, else null.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.length || ids.length > 60 || ids.some((x) => !/^[A-Za-z0-9_:.-]{1,80}$/.test(x))) {
    return NextResponse.json({ error: "Invalid report ids." }, { status: 400 });
  }
  try {
    const r = await storyAnalysis(ids, s.email);
    return NextResponse.json({ analysis: r.analysis, noAi: r.noAi ? NO_AI_WORDS[r.noAi] : null });
  } catch (err) {
    return failed(err, "the analysis");
  }
}
