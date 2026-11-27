import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { serverWorld } from "@/lib/thunai/world";
import { lexiconNow, lexForBrowser } from "@/lib/thunai/v10/lexserver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * v10: the day's names for Jarvis's lanes (storms and names in the news, with their spellings and sound keys), built from the store's news of
 * the week (lib/thunai/v10/lexserver.ts). Read-only; the store's headlines' names only, no citizen's words.
 *
 * 27 Nov: answered at once from the lexicon held (even an older build's), else an empty list with `building: true`; the lexicon is never
 * built here. Building it on this request held the hosted copy's one core 7-8 s when Jarvis opened, and every request behind it waited
 * (the report of 27 Nov, cause 2). The keep-warm builds it after the start and each new build, in slices (lexserver.ts).
 */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    const lex = lexiconNow(await serverWorld());
    return NextResponse.json(lex ? { entities: lexForBrowser(lex) } : { entities: [], building: true });
  } catch (err) {
    return failed(err, "Jarvis's names of the day");
  }
}
