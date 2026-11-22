import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { audit } from "@/lib/collector/sources";
import { checkRateLimit } from "@/lib/rate-limit";
import { placeLookup } from "@/lib/map/ask";
import { makePack, packHtml, PACK_KINDS, type PackKind } from "@/lib/map/packs";
import { world } from "@/lib/map/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A meeting pack (lib/map/packs.ts): ?kind=weekly|monsoon; &format=html gives the printable page, else JSON for the panel. A department
 * officer's pack counts only their department's cases (the department comes from the database).
 */
export async function GET(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`mappack:${s.userId}`, 12, 600);
  if (!gate.allowed) return NextResponse.json({ error: `Too many packs in a few minutes. Try again in ${gate.retryAfterSeconds} s.` }, { status: 429 });
  const kind = req.nextUrl.searchParams.get("kind") as PackKind;
  if (!PACK_KINDS.includes(kind)) return NextResponse.json({ error: "Choose weekly or monsoon." }, { status: 400 });
  try {
    const { world: w, resolver } = await world();
    const lock = s.role === "department_officer" ? s.lockDept : null;
    const pack = await makePack(kind, w, { place: placeLookup(w, resolver, lock), lang: "en", lockDept: lock }, lock, req.signal);
    await audit(s.email, "ask_map:pack", "map_pack", null, null, { kind, words: pack.wordsBy });
    if (req.nextUrl.searchParams.get("format") === "html") return new NextResponse(packHtml(pack), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    return NextResponse.json({ pack });
  } catch (e) {
    console.error("[map] pack failed", e);
    return NextResponse.json({ error: "The pack could not be made just now." }, { status: 500 });
  }
}
