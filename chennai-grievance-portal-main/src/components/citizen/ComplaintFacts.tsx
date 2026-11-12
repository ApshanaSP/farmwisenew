import type { LucideIcon } from "lucide-react";

/**
 * The label/value lists on the citizen's complaint view (/citizen/track-complaints). A <dl> may hold only <dt>/<dd> groups, each
 * group wrapped in at most one <div> that holds nothing else (HTML, and axe's definition-list and dlitem rules: P6-031). So an
 * icon goes inside its <dt>, and a side-by-side layout comes from the <dl>'s own grid, never from a wrapper inside it.
 */
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle";

export interface Fact { icon: LucideIcon; label: string; value: string }

/** The complaint's key facts under its title: department, type, location, filed on. */
export function ComplaintFacts({ facts, className = "" }: { facts: Fact[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 ${className}`.trim()}>
      {facts.map(({ icon: Icon, label, value }) => (
        <div key={label} className="min-w-0">
          <dt className={`flex items-center gap-2 ${LABEL}`}>
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-ink-subtle" aria-hidden="true" />
            {label}
          </dt>
          <dd className="truncate pl-[22px] text-[13px] font-medium text-ink-muted" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Where the complaint is and what it says (the side panel): street, specific location, ward and anonymous side by side, description. */
export function ComplaintPlace({ street, specificLocation, ward, anonymous, description }: {
  street: string | null; specificLocation: string | null; ward: string | number | null; anonymous: boolean; description: string | null;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
      <div className="col-span-2"><dt className={LABEL}>Street</dt><dd className="text-ink-muted">{street}</dd></div>
      <div className="col-span-2"><dt className={LABEL}>Specific location</dt><dd className="text-ink-muted">{specificLocation || "—"}</dd></div>
      <div><dt className={LABEL}>Ward</dt><dd className="font-mono text-ink-muted">{ward}</dd></div>
      <div><dt className={LABEL}>Anonymous</dt><dd className="text-ink-muted">{anonymous ? "Yes" : "No"}</dd></div>
      <div className="col-span-2"><dt className={LABEL}>Description</dt><dd className="leading-relaxed text-ink-muted">{description}</dd></div>
    </dl>
  );
}
