import { Wordmark } from "@/components/Logo";

/** The District IQ lock-up: the full logo (DistrictIQ by FarmwiseAI) and, after a hairline, the place in small caps. */
export default function BrandWordmark({ sub = "Chennai", size = 34, className = "" }: { sub?: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex-none" style={{ height: Math.round(size * 1.18) }}><Wordmark className="h-full" /></span>
      <span className="hidden border-l border-canvas-border pl-3 text-[10px] font-semibold uppercase leading-[1.25] tracking-[0.16em] text-ink-subtle sm:block">{sub}</span>
    </span>
  );
}
