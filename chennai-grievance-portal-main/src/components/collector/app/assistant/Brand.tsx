"use client";

/**
 * Ask District IQ's identity: the District IQ kolam "D" on the AI gradient (coral) with a sparkle for the
 * live node. Coral is reserved for AI, so this mark only ever means "the assistant". Used on the launcher, the panel
 * header, the empty state and beside each answer.
 */
import { useId } from "react";

export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const g = `dq${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={`aq-mark ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="3" y1="2" x2="37" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF7A5C" />
          <stop offset="1" stopColor="#F0525A" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#${g})`} />
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill="none" stroke="#fff" strokeOpacity=".24" />
      <path d="M12.5 10.5h7.5a9.5 9.5 0 0 1 0 19h-7.5Z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="17" cy="15.5" r="1.7" fill="#fff" />
      <circle cx="17" cy="24.5" r="1.7" fill="#fff" />
      {/* the sparkle: AI */}
      <path d="M23.5 15.5c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4Z" fill="#fff" />
    </svg>
  );
}
