"use client";

/**
 * Ask District IQ's identity: the District IQ "D" (the official DistrictIQ by FarmwiseAI mark, public/brand) on a white
 * tile, with a coral sparkle in the corner. Coral is reserved for AI, so the sparkle is what says "the assistant". Used
 * on the launcher, the panel header, the empty state and beside each answer.
 */
import { useId } from "react";

/**
 * The launcher's icon: a speech bubble with the AI spark inside, drawn in white on the launcher's green (crisp at any size,
 * unlike the bitmap mark shrunk into a coral circle it replaced).
 */
export function AskIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="ask-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path d="M12 3.2c5 0 8.8 3.3 8.8 7.6S17 18.4 12 18.4c-.9 0-1.8-.1-2.6-.3L5 20.4l1.1-3.9C4.3 15.1 3.2 13.1 3.2 10.8 3.2 6.5 7 3.2 12 3.2Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 6.9c.4 2 1.2 2.8 3.2 3.2-2 .4-2.8 1.2-3.2 3.2-.4-2-1.2-2.8-3.2-3.2 2-.4 2.8-1.2 3.2-3.2Z" fill="#FFB199" />
    </svg>
  );
}

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
