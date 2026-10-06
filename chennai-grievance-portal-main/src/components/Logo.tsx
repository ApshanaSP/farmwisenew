interface LogoProps {
  className?: string;
  /** kept for older callers: the mark is the same ocean tile on any background */
  tone?: "navy" | "white";
  /** "ai": the coral variant used by Ask District IQ */
  variant?: "brand" | "ai";
}

/**
 * District IQ mark: a kolam-inspired "D". A single unbroken line loops round a dot grid, as a kolam is drawn round its
 * pulli dots, and the live node is coral. Ocean gradient tile; reads at 16 px.
 */
export default function Logo({ className = "h-10 w-10", variant = "brand" }: LogoProps) {
  const ai = variant === "ai";
  // identical definitions per variant, so a shared id is safe (no hook: the mark renders in server components too)
  const id = ai ? "diq-logo-ai" : "diq-logo";
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="District IQ">
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={ai ? "#FF7A5C" : "#0A3D62"} />
          <stop offset="1" stopColor={ai ? "#F0525A" : "#13A3BA"} />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${id})`} />
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${id}s)`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="12.5" fill="none" stroke="#fff" strokeOpacity=".22" />
      {/* the kolam line: one stroke forming the D */}
      <path d="M15 12.5h9.5a11.5 11.5 0 0 1 0 23H15Z" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
      {/* pulli dots */}
      <circle cx="20.5" cy="18.5" r="2" fill="#fff" />
      <circle cx="20.5" cy="29.5" r="2" fill="#fff" />
      <circle cx="27.5" cy="24" r="4.6" fill="#FF8466" opacity=".35" />
      <circle cx="27.5" cy="24" r="2.6" fill="#FF7A5C" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}
