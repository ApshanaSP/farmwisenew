import { notFound } from "next/navigation";
import Harness from "./Harness";

export const dynamic = "force-dynamic";

/** Dev only: Thunai on a stand-in console (no sign-in, no data store), to check the orb, pointer, chips and undo. */
export default function ThunaiDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Harness />;
}
