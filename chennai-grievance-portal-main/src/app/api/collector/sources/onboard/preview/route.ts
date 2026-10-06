import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { previewRows } from "@/lib/collector/onboard";
import { Mapping } from "../schema";

export const dynamic = "force-dynamic";

const Body = z.object({ records: z.array(z.record(z.string().max(1600))).max(8), mapping: Mapping });

/** The sample records again through a mapping the Collector changed (no AI, nothing stored). */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid mapping." }, { status: 400 });
  try {
    return NextResponse.json({ preview: await previewRows(parsed.data.records, parsed.data.mapping) });
  } catch (err) {
    return failed(err, "the preview");
  }
}
