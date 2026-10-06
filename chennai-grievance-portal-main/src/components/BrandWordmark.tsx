import Logo from "@/components/Logo";

/** The District IQ lock-up: the kolam mark, "District IQ" in Geist 600 and "Chennai" in small caps beneath. */
export default function BrandWordmark({ sub = "Chennai", size = 34, className = "" }: { sub?: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="flex-none" style={{ width: size, height: size }}><Logo className="h-full w-full" /></span>
      <span className="leading-none">
        <span className="block text-[16px] font-semibold tracking-[-0.02em] text-ink">District IQ</span>
        <span className="mt-[3px] block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{sub}</span>
      </span>
    </span>
  );
}
