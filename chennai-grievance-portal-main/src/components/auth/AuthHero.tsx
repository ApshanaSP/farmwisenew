"use client";

/**
 * The sign-in hero: Chennai's 200 wards drawn as a quiet map, zone pins dropping in, and a beam that travels
 * Citizen -> Officer -> Collector (the path every complaint takes). A soft spotlight follows the cursor.
 * Dark graphite in the dark theme, a paper map with azure pins in the light theme. Reduced motion: no spotlight,
 * no beams travelling, pins simply fade in.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Building2, User, Wrench } from "lucide-react";
import { CountUp, LiveDot } from "@/components/ui";
import { EASE_OUT, reduced } from "@/components/ui/motion";
import { MAP_H, MAP_W, WARDS_D, ZONE_PINS } from "./chennaiMap";

const at = (zone: number) => ZONE_PINS.find((p) => p.zone === zone) ?? ZONE_PINS[0];
// the three desks a complaint passes: a citizen in Adyar, the department office in Teynampet, the Collectorate (Royapuram)
const ROLE = [
  { key: "citizen", label: "Citizen", z: at(13), icon: User },
  { key: "officer", label: "Officer", z: at(9), icon: Wrench },
  { key: "collector", label: "Collector", z: at(5), icon: Building2 }
];
const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend = 60) => {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return `M${a.x} ${a.y} Q${mx - bend} ${my} ${b.x} ${b.y}`;
};

export default function AuthHero({ headline, children }: { headline: ReactNode; children?: ReactNode }) {
  // decided after mount, so the server HTML and the first client render match
  const [reduce, setReduce] = useState(true);
  useEffect(() => setReduce(reduced()), []);
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--sx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  const beams = [curve(ROLE[0].z, ROLE[1].z, 70), curve(ROLE[1].z, ROLE[2].z, -50)];
  return (
    <aside ref={ref} onMouseMove={onMove} className="auth-hero2 relative hidden min-h-0 flex-col overflow-hidden lg:flex">
      <div aria-hidden="true" className="auth-hero2-grid pointer-events-none absolute inset-0" />
      {!reduce && <div aria-hidden="true" className="auth-hero2-spot pointer-events-none absolute inset-0" />}

      {/* the map, on the right half */}
      <svg aria-hidden="true" viewBox={`-20 -10 ${MAP_W + 40} ${MAP_H + 20}`} preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute bottom-[-4%] right-[-2%] top-[4%] h-[100%] w-[52%]">
        <defs>
          <linearGradient id="ah-beam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--h-pin)" stopOpacity="0" />
            <stop offset=".5" stopColor="var(--h-pin)" />
            <stop offset="1" stopColor="#7FD3E6" />
          </linearGradient>
          <radialGradient id="ah-glow"><stop offset="0" stopColor="var(--h-pin)" stopOpacity=".35" /><stop offset="1" stopColor="var(--h-pin)" stopOpacity="0" /></radialGradient>
        </defs>
        <motion.path d={WARDS_D} fill="var(--h-fill)" stroke="var(--h-line)" strokeWidth="0.8" strokeLinejoin="round"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease: EASE_OUT }} />
        {ZONE_PINS.map((p, i) => (
          <motion.circle key={p.zone} cx={p.x} cy={p.y} r="4.5" fill="var(--h-pin)" stroke="var(--h-bg-solid)" strokeWidth="2"
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 0.85 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 520, damping: 14, delay: 0.35 + i * 0.05 }} />
        ))}
        {/* the path of a complaint: faint track, then a beam that runs it twice and rests */}
        {beams.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="var(--h-pin)" strokeOpacity=".55" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
            {!reduce && (
              <motion.path d={d} fill="none" stroke="url(#ah-beam)" strokeWidth="3.5" strokeLinecap="round" pathLength={1}
                strokeDasharray="0.22 1" initial={{ strokeDashoffset: 1.22, opacity: 0 }} animate={{ strokeDashoffset: [1.22, 0], opacity: [0, 1, 1, 0.9] }}
                transition={{ duration: 1.6, delay: 1.3 + i * 0.8, repeat: 1, repeatDelay: 1.2, ease: "easeInOut" }} />
            )}
          </g>
        ))}
        {ROLE.map((r, i) => (
          <motion.g key={r.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1 + i * 0.8, ease: EASE_OUT }}>
            <circle cx={r.z.x} cy={r.z.y} r="34" fill="url(#ah-glow)" />
            {!reduce && (
              <motion.circle cx={r.z.x} cy={r.z.y} r="9" fill="none" stroke="var(--h-pin)" strokeWidth="2"
                initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 3, opacity: 0 }} style={{ transformOrigin: `${r.z.x}px ${r.z.y}px` }}
                transition={{ duration: 1.4, delay: 1.1 + i * 0.8, ease: "easeOut" }} />
            )}
            <circle cx={r.z.x} cy={r.z.y} r="8" fill="var(--h-pin)" stroke="var(--h-bg-solid)" strokeWidth="3" />
            <g transform={`translate(${r.z.x + (i === 2 ? -116 : 16)} ${r.z.y - 15})`}>
              <rect width="100" height="30" rx="15" fill="var(--h-label-bg)" stroke="var(--h-line-strong)" />
              <text x="50" y="20" textAnchor="middle" fill="var(--h-text)" style={{ font: "600 14px var(--font-ui)" }}>{r.label}</text>
            </g>
          </motion.g>
        ))}
      </svg>

      <div className="relative z-10 flex h-full max-w-[52%] flex-col justify-between p-10 xl:p-12">
        <div>
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "var(--h-chip)", color: "var(--h-text-2)", boxShadow: "inset 0 0 0 1px var(--h-line-strong)" }}>
            <LiveDot /> Live across Chennai&apos;s 15 zones
          </motion.span>
          <motion.h2 initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.6, delay: 0.08, ease: EASE_OUT }}
            className="mt-6 text-balance text-[2.15rem] font-semibold leading-[1.08] tracking-[-0.03em]" style={{ color: "var(--h-text)" }}>
            {headline}
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.16, ease: EASE_OUT }}
            className="mt-4 max-w-[34ch] text-[15px] leading-relaxed" style={{ color: "var(--h-text-2)" }}>
            Complaints, field reports, news, weather and water levels in one place, so every desk works from the same picture.
          </motion.p>
          {children}
        </div>
        <div className="grid grid-cols-3 gap-4 border-t pt-5" style={{ borderColor: "var(--h-line-strong)" }}>
          {([[15, "Zones"], [200, "Wards"], [8, "Live data feeds"]] as const).map(([v, l]) => (
            <div key={l}>
              <p className="font-display text-[28px] font-extrabold tracking-[-0.035em] tabular" style={{ color: "var(--h-text)" }}><CountUp value={v} duration={1200} /></p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--h-text-3)" }}>{l}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
