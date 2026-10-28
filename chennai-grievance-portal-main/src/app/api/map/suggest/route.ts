import { NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { suggestions } from "@/lib/map/suggest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The Ask box's suggested questions: made from the live data, each with a non-empty answer. */
export async function GET() {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ items: await suggestions() });
  } catch (e) {
    console.error("[map] suggestions failed", e);
    return NextResponse.json({ items: [] });
  }
}
