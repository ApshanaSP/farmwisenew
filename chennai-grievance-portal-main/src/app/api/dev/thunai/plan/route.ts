import { NextRequest, NextResponse } from "next/server";
import { PlanBody, screenOf, think } from "@/lib/thunai/brain";
import { WORLD } from "@/lib/thunai/fixture";
import { ZONE_TA_NAME } from "@/lib/thunai/lexicon";
import { referenceWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev test console's brain (/dev/thunai): the same Nova Lite planner on the reference lists. 404 in production. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const parsed = PlanBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ plan: { kind: "none" }, why: "bad request" }, { status: 400 });
  const { text, state, turns } = parsed.data;
  const r = await think(text, screenOf(state), { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts }, { turns }, "dev:thunai");
  if (r.error) console.error("thunai dev plan failed", r.error);
  return NextResponse.json({ plan: r.plan, ms: r.ms, model: r.model });
}
