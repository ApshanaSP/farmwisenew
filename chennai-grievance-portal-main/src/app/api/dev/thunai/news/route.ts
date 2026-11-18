import { NextRequest, NextResponse } from "next/server";
import { newsDoc } from "@/lib/collector/intel";
import { localOnly } from "@/lib/thunai/devguard";
import { incidentNewsDoc } from "@/lib/thunai/newsdoc";
import { NewsBody, ndjson, newsEvents, type StoredDoc } from "@/lib/thunai/web/serve";
import { aideReady, answerStyle } from "@/lib/thunai/aide7";
import { newsAide } from "@/lib/thunai/aide7/news";
import { serverWorld } from "@/lib/thunai/world";
import { understandV8 } from "@/lib/thunai/v8/flag8";
import { feedLines, foundStory, type FindAsk } from "@/lib/thunai/v8/newsfind";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev console's twin of /api/collector/thunai/news: the same code on the local store, no sign-in. 404 in production. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  const parsed = NewsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { id }, { incident } or { question }." }, { status: 400 });
  // v7: the aide writes the spoken brief from the article (JARVIS_ANSWER=v6, or no model configured: the code brief, as v6)
  const aide = answerStyle() === "v7" && aideReady() ? newsAide(await serverWorld(), { user: "dev", signal: req.signal }) : undefined;
  // v8: a story by its topic and a news question (the owner's examples 1 and 2); the world is read only when one is asked; JARVIS_UNDERSTAND=v7 turns them off
  const v8 = understandV8() ? { find: async (f: FindAsk) => foundStory(f, { world: await serverWorld() }), feedLines: async (f: FindAsk, words: string[]) => feedLines(f, words, { world: await serverWorld() }) } : {};
  return ndjson(newsEvents(parsed.data, { loadDoc: (id) => newsDoc(id) as Promise<StoredDoc | null>, incidentDoc: incidentNewsDoc, signal: req.signal, user: "dev", aide, ...v8 }));
}
