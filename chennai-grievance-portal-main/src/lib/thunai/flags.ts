/**
 * v6: a browser flag's value. Next inlines NEXT_PUBLIC_* at build time, so measuring a lever on and off would need a build each way.
 * In a MEASURING build only (NEXT_PUBLIC_JARVIS_SPEC=1, the bundle the real-path specs run against; never a normal production build),
 * the spec may set `window.__jvFlags = { NEXT_PUBLIC_JARVIS_KWS: "off", ... }` before the page loads, and that value wins. Everywhere
 * else the build's own value stands. The caller passes the build's value (process.env.NEXT_PUBLIC_X written out in full, so Next
 * inlines it).
 */
declare global {
  interface Window { __jvFlags?: Record<string, string> }
}
const measuring = () => process.env.NEXT_PUBLIC_JARVIS_SPEC === "1" || process.env.NODE_ENV === "test";

export function flag(name: string, built: string | undefined): string | undefined {
  if (measuring() && typeof window !== "undefined") {
    const v = window.__jvFlags?.[name];
    if (typeof v === "string") return v;
  }
  return built;
}
