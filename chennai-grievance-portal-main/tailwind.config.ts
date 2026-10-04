import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (f: string) => Object.fromEntries(SHADES.map((s) => [s, v(`${f}-${s}`)]));
const FAMILIES = ["red", "rose", "orange", "amber", "yellow", "emerald", "green", "teal", "sky", "blue", "indigo", "violet", "gray", "slate"];

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      // every colour is a theme variable (src/app/theme.css): District IQ dark by default, light under html[data-theme="light"]
      colors: {
        ...Object.fromEntries(FAMILIES.map((f) => [f, scale(f)])),
        navy: { DEFAULT: v("navy-600"), ...scale("navy") },
        gold: { DEFAULT: v("gold-500"), ...scale("gold") },
        ink: { DEFAULT: v("ink"), muted: v("ink-muted"), subtle: v("ink-subtle"), faint: v("ink-faint") },
        canvas: { DEFAULT: v("canvas"), raised: v("canvas-raised"), sunken: v("canvas-sunken"), border: v("canvas-border") }
      },
      backgroundImage: { brand: "var(--grad)" },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"]
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }]
      },
      boxShadow: {
        xs: "var(--sh-xs)",
        soft: "var(--sh-soft)",
        card: "var(--sh-card)",
        lift: "var(--sh-lift)",
        glow: "var(--sh-glow)",
        "glow-gold": "var(--sh-glow-gold)",
        brand: "var(--brand-glow)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.08)"
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
        "4xl": "2rem"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        drift: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-18px, -24px) scale(1.06)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        },
        "progress-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        drift: "drift 14s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "progress-grow": "progress-grow 0.5s cubic-bezier(0.22, 1, 0.36, 1) both"
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
