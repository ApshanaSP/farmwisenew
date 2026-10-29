import { notFound } from "next/navigation";
import Preview from "./Preview";

export const metadata = { title: "Rain rehearsal preview · District IQ" };

/**
 * The officer's before-rain tasks card without a sign-in (development only; its API answers only with a dry-run store:
 * /api/rehearsal/dev): ?officer=GCC-SWD, ?theme=dark. Rain & flooding is on the Collector's map: /dev/collector?rain=1.
 */
export default function DevRehearsalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview />;
}
