import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CollectorApp from "@/components/collector/app/CollectorApp";
import { deptList, overview } from "@/lib/collector/intel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Collector console preview · District IQ" };

/**
 * The Collector console on the live store without a sign-in, for designing its layout (development only, on a dry-run
 * store, from this PC: everywhere else it does not exist). Its own API calls still need the Collector's sign-in, so
 * actions and reloads fail here; the first screen is the real one.
 */
export default async function DevCollectorPage() {
  const host = (headers().get("host") ?? "").split(":")[0];
  if (process.env.NODE_ENV === "production" || process.env.AWS_STORE_DRY_RUN !== "1" || !(host === "localhost" || host === "127.0.0.1")) notFound();
  const [initial, depts] = await Promise.all([overview("daily", null), deptList()]);
  return <CollectorApp initial={initial} allDepts={depts} user="dev-preview@localhost" />;
}
