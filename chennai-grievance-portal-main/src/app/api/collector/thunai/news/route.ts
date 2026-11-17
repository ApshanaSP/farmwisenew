import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { newsDoc } from "@/lib/collector/intel";
import { checkRateLimit } from "@/lib/rate-limit";
import { incidentNewsDoc } from "@/lib/thunai/newsdoc";
import { NewsBody, ndjson, newsEvents, type StoredDoc } from "@/lib/thunai/web/serve";
import { aideReady, answerStyle } from "@/lib/thunai/aide7";
import { newsAide } from "@/lib/thunai/aide7/news";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Jarvis reads the news (v6 Phase 4, lib/thunai/web): POST { id } (a stored news item) or { question } (a public question).
 * NDJSON events: "first" at once, then "brief" (the article), "related" and "brief" (the coverage compared), or "answer"; "done".
 * Read-only: nothing is written, and nothing a web page says can make Jarvis act.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-news:${s.userId}`, 20, 60);
  if (!gate.allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  const parsed = NewsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { id }, { incident } or { question }." }, { status: 400 });
  // v7: the aide writes the spoken brief from the article (JARVIS_ANSWER=v6, or no model configured: the code brief, as v6)
  const aide = answerStyle() === "v7" && aideReady() ? newsAide(await serverWorld(), { user: `collector:${s.userId}`, signal: req.signal }) : undefined;
  return ndjson(newsEvents(parsed.data, { loadDoc: (id) => newsDoc(id) as Promise<StoredDoc | null>, incidentDoc: incidentNewsDoc, signal: req.signal, user: `collector:${s.userId}`, aide }));
}
