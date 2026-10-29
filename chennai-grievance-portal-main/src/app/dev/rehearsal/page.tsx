import { notFound } from "next/navigation";
import Preview from "./Preview";

export const metadata = { title: "Rain rehearsal preview · District IQ" };

/**
 * Rain Rehearsal on the live engine without a Collector sign-in, for designing and testing it (development only, and
 * its API answers only with a dry-run store: /api/rehearsal/dev). ?replay=rain-2026-10-21, ?manual=1, ?theme=dark,
 * ?officer=GCC-SWD for the officer's before-rain tasks card.
 */
export default function DevRehearsalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview />;
}
