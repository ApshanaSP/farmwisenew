/* eslint-disable @next/next/no-img-element -- small static brand images; next/image would only add a wrapper */

interface LogoProps {
  className?: string;
  /** "white": the light version, for places that are dark in both themes (the sign-in hero) */
  tone?: "navy" | "white";
}

/**
 * The District IQ brand by FarmwiseAI (public/brand, cut from the official logo). Each image comes in two versions: the
 * dark-green original for light pages and a light one for dark pages; CSS in globals.css (.brand-swap) shows the one
 * that fits the theme, so the logo reads in both.
 */
function Swap({ base, className, tone, label }: { base: string; className: string; tone?: LogoProps["tone"]; label: string }) {
  if (tone === "white") return <img src={`${base}-light.png`} alt={label} className={`brand-img ${className}`} draggable={false} />;
  return (
    <span className={`brand-swap ${className}`} role="img" aria-label={label}>
      <img src={`${base}.png`} alt="" className="brand-on-light" draggable={false} />
      <img src={`${base}-light.png`} alt="" className="brand-on-dark" draggable={false} />
    </span>
  );
}

/** The mark alone: the "D" with the district's network and the FarmwiseAI leaf. For small, square places. */
export default function Logo({ className = "h-10 w-10", tone }: LogoProps) {
  return <Swap base="/brand/districtiq-mark" className={className} tone={tone} label="District IQ" />;
}

/** The full logo: the mark, "DistrictIQ" and "by FarmwiseAI". Give it a height; the width follows. */
export function Wordmark({ className = "h-10", tone }: LogoProps) {
  return <Swap base="/brand/districtiq-wordmark" className={`brand-wm ${className}`} tone={tone} label="District IQ by FarmwiseAI" />;
}
