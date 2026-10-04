"use client";

/**
 * Ask District IQ's identity: the District IQ boundary with a single live intelligence node at its centre and two
 * signal arcs (the copilot listening to the district). Used on the launcher, the panel header, the empty state and
 * beside each answer.
 */
import { useId } from "react";

export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const g = `dq${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={`aq-mark ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="6" y1="5" x2="34" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8DB6FF" />
          <stop offset="1" stopColor="#2F6FE6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0A1426" stroke="rgba(138,164,214,.32)" />
      <path d="M13 8 28 6.8 33.5 18.5 26.5 32.5 10 30.5 6.5 17.2Z" fill="rgba(76,141,255,.1)" stroke={`url(#${g})`} strokeWidth="2" strokeLinejoin="round" />
      <path d="M14.8 15.2a8 8 0 0 1 10.4 0M12.2 12.4a11.8 11.8 0 0 1 15.6 0" fill="none" stroke="#8DB6FF" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
      <circle cx="20" cy="21" r="5.2" fill="#2BD4E6" opacity=".18" />
      <circle cx="20" cy="21" r="3.1" fill="#2BD4E6" />
    </svg>
  );
}
