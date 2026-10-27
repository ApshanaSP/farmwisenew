import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { asOf } from "@/lib/collector/intel";
import { alertLane } from "@/lib/collector/alerts";
import { aiStatus } from "@/lib/ai/gateway";
import { adminNotice, keyProblems } from "@/lib/ai/keyhealth";

export const dynamic = "force-dynamic";

/**
 * The banners at the top of the console: the alerts lane (IMD, NDMA SACHET and warning news side by side, with stale
 * hazard feeds; lib/collector/alerts.ts) and the admin notice when an AI key has been refused (lib/ai/keyhealth.ts).
 */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    const [lane, ai] = [await alertLane(await asOf()), aiStatus()];
    return NextResponse.json({ lane, admin: adminNotice(keyProblems(), ai.available) }, { headers: { "Cache-Control": "private, no-cache" } });
  } catch (err) {
    return failed(err, "the alerts");
  }
}
