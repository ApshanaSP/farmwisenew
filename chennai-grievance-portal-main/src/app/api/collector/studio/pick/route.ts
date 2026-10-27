import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { note, stream } from "@/lib/studio/http";
import { ingestPick } from "@/lib/studio/pipeline";
import { getPick, validId } from "@/lib/studio/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The picker (a link that held several datasets): GET a card's 5-row preview (from what was already read, no new
 * request), POST the Collector's choice (one dataset, several combined, or a series as latest / all / kept updating),
 * answered as the seven agents' stream like any other add.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const id = (req.nextUrl.searchParams.get("id") ?? "").slice(0, 60);
  const saved = validId(token) ? getPick(token) : null;
  if (!saved) return NextResponse.json({ error: "That list of datasets is no longer here. Add the link again." }, { status: 404 });
  if (!id) return NextResponse.json({ pick: saved.pick });
  const f = saved.found.find((x) => x.cand.id === id);
  if (!f) return NextResponse.json({ error: "That dataset is not in this list." }, { status: 404 });
  return NextResponse.json({ headers: f.table.headers.slice(0, 12), rows: f.table.rows.slice(0, 5).map((r) => r.slice(0, 12)) });
}

const Body = z.object({
  token: z.string().max(40),
  ids: z.array(z.string().max(60)).min(1).max(50),
  mode: z.enum(["each", "combine", "latest", "all", "connector"]).default("each"),
  name: z.string().trim().max(100).optional().nullable()
});

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!checkRateLimit(`studio-add:${s.userId}`, 30, 600).allowed) return NextResponse.json({ error: "Too many datasets in a few minutes. Try again shortly." }, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success || !validId(b.data.token)) return NextResponse.json({ error: "Choose at least one dataset." }, { status: 400 });
  const d = b.data;
  return stream(async (emit) => {
    const id = await ingestPick(d.token, { ids: d.ids, mode: d.mode, name: d.name ?? null }, s.email, emit);
    await note(s.email, "studio:pick", id, { token: d.token, ids: d.ids, mode: d.mode });
    return id;
  });
}
