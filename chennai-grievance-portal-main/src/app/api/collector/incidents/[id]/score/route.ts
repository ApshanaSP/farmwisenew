import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { collectorSession, failed } from "@/lib/collector/guard";
import { scoreWhy } from "@/lib/collector/scorewhy";

export const dynamic = "force-dynamic";

/**
 * How one incident was scored: its severity points, priority terms and where its deadline comes from (lib/collector/scorewhy.ts).
 * SELECT *: a build made before score_why and sla_source existed simply lacks them, and the breakdown is read from the reasons text.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.id)) {
    return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  }
  try {
    const [rows] = await intelPool.query<RowDataPacket[]>("SELECT * FROM incidents WHERE incident_id = ?", [params.id]);
    const r = rows[0];
    return r ? NextResponse.json(scoreWhy(r)) : NextResponse.json({ error: "Incident not found." }, { status: 404 });
  } catch (err) {
    return failed(err, "the incident's scores");
  }
}
