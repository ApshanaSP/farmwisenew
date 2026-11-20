import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { newsDoc } from "@/lib/collector/intel";
import { checkRateLimit } from "@/lib/rate-limit";
import { incidentNewsDoc } from "@/lib/thunai/newsdoc";
import { NewsBody, ndjson, newsEvents, type StoredDoc } from "@/lib/thunai/web/serve";
import { aideReady, answerStyle } from "@/lib/thunai/aide7";
import { newsAide } from "@/lib/thunai/aide7/news";
import { serverWorld } from "@/lib/thunai/world";
import { feedLines, foundStory, type FindAsk } from "@/lib/thunai/v8/newsfind";
import { serverHands } from "@/lib/thunai/data";
import { weatherLines } from "@/lib/thunai/v10/weather10";
import { semScores } from "@/lib/thunai/v10/sem10";
import { newsBrief10 } from "@/lib/thunai/v10/brief10";
import { understandV10 } from "@/lib/thunai/v10/flag10";
import { tamilNames } from "@/lib/collector/nlp";

/** v10: a locality's Tamil name from the console's gazetteer (the brief's Tamil lines say it), when it has one */
function placeTa(): ((name: string) => string | null) | undefined {
  try {
    const names = tamilNames();
    return (n) => names.find((x) => x.en.some((e) => e.toLowerCase() === n.toLowerCase()))?.ta[0] ?? null;
  } catch { return undefined; }
}

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
  // v8: a story by its topic and a news question (the owner's examples 1 and 2); the world is read only when one is asked; JARVIS_UNDERSTAND=v7 turns them off
  // (served whatever the server's switch says: a browser built with v8 asks for it; the switch decides what the browser asks: the review, 19 Nov)
  // (v10: the request's meaning as a second ranker when the words find nothing: the local multilingual model, v10/sem10.ts)
  const v8 = { find: async (f: FindAsk) => foundStory(f, { world: await serverWorld(), sem: semScores }), feedLines: async (f: FindAsk, words: string[]) => feedLines(f, words, { world: await serverWorld() }) };
  // v10: a storm's weather readings (the rain gauges, IMD's warning), read from the console's own records when a find asks for them
  const hands = serverHands({ email: s.email, role: "collector", lockDept: null }, req.signal);
  const tool = (n: string, a: Record<string, unknown>) => hands.tool(n, a);
  // v10 (JARVIS_V10.md 4.5, 4.9 feature 1): "read" is a brief (what, why, the console's own records, an offer), "read it fully" the whole story,
  // and "what do we have on this?" the console's cases on the story; with no model configured, code says the brief (JARVIS_ANSWER=v6 or
  // JARVIS_UNDERSTAND=v9: as before)
  const brief10 = understandV10() && answerStyle() === "v7"
    ? newsBrief10({ world: await serverWorld(), user: `collector:${s.userId}`, signal: req.signal, tool, weather: () => weatherLines(tool), placeTa: placeTa(), ...(aideReady() ? {} : { write: { rungs: () => [] } }) })
    : undefined;
  const v10 = { weather: () => weatherLines(tool), brief10 };
  return ndjson(newsEvents(parsed.data, { loadDoc: (id) => newsDoc(id) as Promise<StoredDoc | null>, incidentDoc: incidentNewsDoc, signal: req.signal, user: `collector:${s.userId}`, aide, ...v8, ...v10 }));
}
