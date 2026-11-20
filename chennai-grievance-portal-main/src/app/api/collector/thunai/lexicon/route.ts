import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { serverWorld } from "@/lib/thunai/world";
import { dayLexicon, lexForBrowser } from "@/lib/thunai/v10/lexserver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * v10: the day's names for Jarvis's lanes (storms and names in the news, with their spellings and sound keys), built from the store's news of
 * the week (lib/thunai/v10/lexserver.ts). Read-only; the store's headlines' names only, no citizen's words.
 */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    const lex = await dayLexicon(await serverWorld());
    return NextResponse.json({ entities: lexForBrowser(lex) });
  } catch (err) {
    return failed(err, "Jarvis's names of the day");
  }
}
