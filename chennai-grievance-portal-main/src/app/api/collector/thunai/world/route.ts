import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { referenceWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";

/** Thunai's vocabulary from the district reference: categories, taluks (with Tamil names) and places. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(referenceWorld());
  } catch (err) {
    return failed(err, "Thunai's vocabulary");
  }
}
