import { Wordmark } from "@/components/Logo";

/** The District IQ lock-up, as in the consoles' top bar: the full logo (DistrictIQ by FarmwiseAI) and, after a hairline, the place. */
export default function BrandWordmark({ sub = "Chennai", size = 34, className = "" }: { sub?: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex-none" style={{ height: Math.round(size * 1.12) }}><Wordmark className="h-full" /></span>
      <span className="hidden whitespace-nowrap border-l border-canvas-border pl-3 text-[11.5px] font-semibold leading-[1.25] text-ink-subtle sm:block">{sub}</span>
    </span>
  );
}
