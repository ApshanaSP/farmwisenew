import { headers } from "next/headers";
import { notFound } from "next/navigation";
import OfficerApp from "@/components/officer/OfficerApp";
import { deptProfile, officerOverview } from "@/lib/officer/data";
import { OFFICER } from "@/lib/officer/departments";
import type { Period } from "@/lib/collector/intel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Officer console preview · District IQ" };

/**
 * A department officer's console on the live store without a sign-in, for designing its layout (development only, on
 * a dry-run store, from this PC: everywhere else it does not exist). ?dept=GCC-SWD. Its own API calls still need the
 * officer's sign-in, so actions and reloads fail here; the first screen is the real one.
 */
export default async function DevOfficerPage({ searchParams }: { searchParams: { dept?: string } }) {
  const host = (headers().get("host") ?? "").split(":")[0];
  if (process.env.NODE_ENV === "production" || process.env.AWS_STORE_DRY_RUN !== "1" || !(host === "localhost" || host === "127.0.0.1")) notFound();
  const dept = await deptProfile(/^[A-Z0-9-]{2,20}$/.test(searchParams.dept ?? "") ? searchParams.dept! : "GCC-SWD");
  if (!dept) notFound();
  const initial = await officerOverview(dept, { period: OFFICER.defaultPeriod as Period, zone: null, taluk: null });
  return <OfficerApp initial={initial} user="dev-preview@localhost" />;
}
