/**
 * The /api/dev/thunai routes power the evaluation harness on this PC and carry no sign-in, so they answer only a request made
 * to this machine directly: a Host of localhost or 127.0.0.1 and no proxy's forwarding header (host-tunnel.bat's tunnel adds
 * them). A shared dev server or a tunnel gets 404 (OPEN-2, red team C7).
 */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
/** headers that carry the address of whoever really made the request: allowed only when every address in them is this PC */
const CLIENT_ADDRESS = ["x-forwarded-for", "forwarded", "cf-connecting-ip", "x-real-ip", "true-client-ip"];
const LOOPBACK = /^(?:127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3}|localhost)$/i;

/** every address in a header value ("a, b", or Forwarded's for=a;for=b), without quotes, brackets or ports */
function addresses(name: string, value: string): string[] {
  const raw = name === "forwarded" ? [...value.matchAll(/for=("?)([^;,"]+)\1/gi)].map((m) => m[2]) : value.split(",");
  return raw.map((a) => a.trim().replace(/^"|"$/g, "").replace(/^\[([^\]]*)\](?::\d+)?$/, "$1").replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1")).filter(Boolean);
}

/**
 * Next itself adds x-forwarded-for (the socket's address) and x-forwarded-host (the Host) to every request before a route sees it
 * (base-server.js), so their presence says nothing: a request from this PC carries them with this PC's address in them. What says
 * "not from this PC" is an address that is not this PC's, or a forwarded host that is not a local one (audit-privacy_injection-8).
 */
export function localOnly(headers: { get(name: string): string | null }): boolean {
  if (!LOCAL.test(headers.get("host") ?? "")) return false;
  const fh = headers.get("x-forwarded-host");
  if (fh && !LOCAL.test(fh.trim())) return false;
  for (const h of CLIENT_ADDRESS) {
    const v = headers.get(h);
    if (v && !addresses(h, v).every((a) => LOOPBACK.test(a))) return false;
  }
  return true;
}
