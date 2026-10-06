import { StatusPill } from "@/components/ui";
import { ComplaintStatus } from "@/types";

/** A complaint's status as the kit's StatusPill: one colour and icon per status, everywhere. */
export default function StatusBadge({ status, short }: { status: ComplaintStatus; short?: boolean }) {
  return <StatusPill status={status} short={short} />;
}
