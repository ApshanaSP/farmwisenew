interface LogoProps {
  className?: string;
  /** "navy": the dark application tile (on any background); "white": a light tile for light pages */
  tone?: "navy" | "white";
}

/**
 * District IQ symbol: a district boundary (an irregular administrative polygon) holding three connected
 * intelligence nodes; the live node is cyan. Geometric enough to read at 16 px.
 */
export default function Logo({ className = "h-10 w-10", tone = "navy" }: LogoProps) {
  const dark = tone === "navy";
  const id = dark ? "diq-b-d" : "diq-b-l";
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="District IQ">
      <defs>
        <linearGradient id={id} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={dark ? "#8DB6FF" : "#2F6FE6"} />
          <stop offset="1" stopColor={dark ? "#2F6FE6" : "#0B3FA8"} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="12" fill={dark ? "#0A1426" : "#FFFFFF"} stroke={dark ? "rgba(138,164,214,.32)" : "#D5E0F2"} />
      <path d="M15.5 9.5 33.5 8 40 22 31.5 39 12 36.5 8 20.5Z" fill={dark ? "rgba(76,141,255,.12)" : "rgba(47,111,230,.08)"}
        stroke={`url(#${id})`} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M17.5 19.5 28.5 16.5M17.5 19.5 23 29.5M28.5 16.5 23 29.5" stroke={dark ? "#8DB6FF" : "#2F6FE6"} strokeWidth="1.7" strokeLinecap="round" opacity=".9" />
      <circle cx="17.5" cy="19.5" r="2.7" fill={dark ? "#8DB6FF" : "#2F6FE6"} />
      <circle cx="28.5" cy="16.5" r="2.7" fill={dark ? "#8DB6FF" : "#2F6FE6"} />
      <circle cx="23" cy="29.5" r="5.6" fill="#2BD4E6" opacity=".18" />
      <circle cx="23" cy="29.5" r="3.4" fill="#2BD4E6" />
    </svg>
  );
}
