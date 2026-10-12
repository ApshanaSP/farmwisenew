"use client";

/**
 * Ask District IQ's identity: the District IQ "D" (the official DistrictIQ by FarmwiseAI mark, public/brand) on a white
 * tile, with a coral sparkle in the corner. Coral is reserved for AI, so the sparkle is what says "the assistant". Used
 * on the launcher, the panel header, the empty state and beside each answer.
 */
import { useId } from "react";

export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const g = `dq${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={`aq-mark ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="26" y1="2" x2="38" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF7A5C" />
          <stop offset="1" stopColor="#F0525A" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#fff" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill="none" stroke="#0A3524" strokeOpacity=".1" />
      {/* the District IQ mark (163 x 192) */}
      <image href="/brand/districtiq-mark.png" x="8" y="7" width="22.1" height="26" preserveAspectRatio="xMidYMid meet" />
      {/* the sparkle: AI */}
      <path d="M32 3.6c.6 3.1 1.7 4.2 4.8 4.8-3.1.6-4.2 1.7-4.8 4.8-.6-3.1-1.7-4.2-4.8-4.8 3.1-.6 4.2-1.7 4.8-4.8Z"
        fill={`url(#${g})`} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
