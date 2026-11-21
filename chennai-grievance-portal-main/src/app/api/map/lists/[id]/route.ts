import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assistantSession } from "@/lib/assistant/access";
import { audit } from "@/lib/collector/sources";
import { approveList, getList, mayChange, removeList } from "@/lib/map/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["approve", "remove"]) });

/** Approve a draft (it shows on the map as "your list") or remove a list: the officer who uploaded it, or a Collector. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const l = getList(id);
  if (!l) return NextResponse.json({ error: "No such list." }, { status: 404 });
  if (!mayChange(l, s)) return NextResponse.json({ error: "Only the officer who uploaded this list, or the Collector, can change it." }, { status: 403 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Say approve or remove." }, { status: 400 });
  if (b.data.action === "approve") {
    if (!l.rows.some((r) => r.how !== "none")) return NextResponse.json({ error: "No row of this list could be placed, so there is nothing to show." }, { status: 400 });
    const done = approveList(id, s.email);
    await audit(s.email, "ask_map:list_approve", "map_list", id, { status: l.status }, { status: "approved", rows: l.rows.filter((r) => r.how !== "none").length });
    return NextResponse.json({ list: done });
  }
  removeList(id);
  await audit(s.email, "ask_map:list_remove", "map_list", id, { status: l.status, rows: l.rows.length }, null);
  return NextResponse.json({ ok: true });
}
