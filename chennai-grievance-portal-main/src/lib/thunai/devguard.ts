/**
 * The /api/dev/thunai routes power the evaluation harness on this PC and carry no sign-in, so they answer only a request made
 * to this machine directly: a Host of localhost or 127.0.0.1 and no proxy's forwarding header (host-tunnel.bat's tunnel adds
 * them). A shared dev server or a tunnel gets 404 (OPEN-2, red team C7).
 */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const FORWARDED = ["x-forwarded-for", "x-forwarded-host", "forwarded", "cf-connecting-ip", "x-real-ip", "true-client-ip"];

export function localOnly(headers: { get(name: string): string | null }): boolean {
  if (!LOCAL.test(headers.get("host") ?? "")) return false;
  return !FORWARDED.some((h) => headers.get(h));
}
