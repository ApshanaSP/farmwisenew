/**
 * Downloading what a link points to, as sent (no browser). Share links are turned into the file itself (a Google
 * Sheet into its CSV export, Dropbox ?dl=0 into ?dl=1, a GitHub page into the raw file).
 *
 * Only public http(s) addresses are fetched: a name that resolves to this machine or a private network is refused (no
 * reaching into the server's own network through a pasted link), unless the host is listed in STUDIO_ALLOW_HOSTS (a
 * demo department app on this machine). Redirects are followed by hand and every hop is checked the same way (the
 * shared lib/netsafe.ts); a sign-in (key, password) is sent only to the host it was given for. Size and time are capped.
 *
 * The Studio announces itself honestly: a site that refuses it is reported as refusing, never retried in disguise.
 */
import { UnsafeUrlError, assertPublicUrl, safeFetch } from "@/lib/netsafe";
import { dataLinksIn, feedLinkIn, htmlTables } from "@/lib/studio/parse";

export const MAX_BYTES = 15 * 1024 * 1024;
export const UA = "DistrictIQ/1.0 (Chennai District Collectorate; data studio)";
export const UA_TOKEN = "DistrictIQ";

export type LinkErrorCode = "invalid" | "private" | "network" | "timeout" | "auth" | "forbidden" | "limited" | "missing" | "http" | "size" | "robots" | "login" | "browser" | "empty";
export class LinkError extends Error {
  constructor(message: string, public code: LinkErrorCode = "http", public status: number | null = null) { super(message); }
}

/** The direct file behind a share link. */
export function directUrl(raw: string): string {
  const u = new URL(raw.trim());
  if (u.hostname === "docs.google.com" && /\/spreadsheets\/d\//.test(u.pathname)) {
    const id = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
    const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid");
    if (id && !/\/pub/.test(u.pathname)) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  }
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) { u.searchParams.set("dl", "1"); return u.toString(); }
  // a Google Drive file shared with "anyone with the link"
  const drive = u.hostname === "drive.google.com" && (u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? (u.pathname === "/open" ? u.searchParams.get("id") : null));
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive}`;
  // a published Google Sheet (pubhtml) as CSV
  if (u.hostname === "docs.google.com" && /\/spreadsheets\/d\/e\/.+\/pubhtml/.test(u.pathname)) return u.toString().replace(/\/pubhtml.*$/, "/pub?output=csv");
  if (u.hostname === "github.com" && /\/blob\//.test(u.pathname)) return `https://raw.githubusercontent.com${u.pathname.replace("/blob/", "/")}`;
  return u.toString();
}

/** Hosts (host or host:port) the administrator allows although they are private: a demo department app on this PC. */
function allowed(u: URL): boolean {
  const list = (process.env.STUDIO_ALLOW_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.includes(u.host.toLowerCase()) || list.includes(u.hostname.toLowerCase());
}

const hostOk = new Map<string, { ok: boolean; at: number }>();
/** The shared check's refusal (lib/netsafe.ts) in the Studio's words. */
function linkErrorOf(e: unknown): unknown {
  if (!(e instanceof UnsafeUrlError)) return e;
  if (e.code === "private") return new LinkError("That address is on a private network and cannot be read.", "private");
  if (e.code === "dns") return new LinkError(e.message.replace("The site", "The address").replace(" (DNS)", ""), "network");
  if (e.code === "redirects") return new LinkError("The link redirected too many times.", "http");
  return new LinkError(e.message.includes("user name") ? "Put the user name and password in the sign-in fields, not in the link." : "Only http and https links can be read.", "invalid");
}

/** Throws for anything but a public http(s) address (lib/netsafe.ts), or a host in STUDIO_ALLOW_HOSTS. Used for every
 *  hop, every discovered file and every browser request. */
export async function checkHost(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new LinkError("Only http and https links can be read.", "invalid");
  if (u.username || u.password) throw new LinkError("Put the user name and password in the sign-in fields, not in the link.", "invalid");
  if (allowed(u)) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const c = hostOk.get(host);
  if (c && Date.now() - c.at < 60_000) { if (!c.ok) throw new LinkError("That address is on a private network and cannot be read.", "private"); return; }
  try {
    await assertPublicUrl(u);
    hostOk.set(host, { ok: true, at: Date.now() });
  } catch (e) {
    if (e instanceof UnsafeUrlError && e.code === "private") hostOk.set(host, { ok: false, at: Date.now() });
    throw linkErrorOf(e);
  }
}

/** A sign-in sent with a request: headers and query parameters, only to the host they were given for. */
export interface Credentials { host: string; headers?: Record<string, string>; query?: Record<string, string> }

export interface Fetched { buf: Buffer; name: string; contentType: string; url: string; status: number }

/** The message for an HTTP status that stops a read. */
export function statusError(status: number, signedIn: boolean): LinkError {
  if (status === 401) return new LinkError(signedIn ? "The site did not accept the sign-in details (HTTP 401). Check them and try again." : "The site asks for a sign-in (HTTP 401). Add the link again with its sign-in details.", "auth", status);
  if (status === 403) return new LinkError(signedIn
    ? "The site refused this account (HTTP 403): it may not have access to this page."
    : "The site refused access (HTTP 403). It may need a sign-in, or it may not allow automated reading. If you have access, add the link with its sign-in details, or download the file and drop it here.", "forbidden", status);
  if (status === 404 || status === 410) return new LinkError(`Nothing is at that address (HTTP ${status}). Check the link.`, "missing", status);
  if (status === 429) return new LinkError("The site is limiting how often it can be read (HTTP 429). Try again in a few minutes.", "limited", status);
  if (status >= 500) return new LinkError(`The site has a problem of its own right now (HTTP ${status}). Try again later.`, "http", status);
  return new LinkError(`The link answered HTTP ${status}.`, "http", status);
}

/** One download (lib/netsafe.ts): redirects followed and checked, the sign-in sent to its own host only, the size capped. */
export async function fetchOnce(raw: string, cred?: Credentials | null, accept?: string, timeoutMs = 25_000): Promise<Fetched> {
  let url: URL;
  try { url = new URL(directUrl(raw)); } catch { throw new LinkError("That is not a valid link.", "invalid"); }
  let got: Awaited<ReturnType<typeof safeFetch>>;
  try {
    got = await safeFetch(url, {
      allow: allowed, maxHops: 8, timeout: timeoutMs, maxBytes: MAX_BYTES,
      onTooLarge: () => new LinkError("The file is larger than 15 MB.", "size"),
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9", Accept: accept ?? "text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*;q=0.5" },
      // the sign-in goes to the host it was given for, on whichever hop reaches it
      prepare: (u) => {
        if (!cred || u.host !== cred.host) return;
        const target = new URL(u);
        if (cred.query) for (const [k, v] of Object.entries(cred.query)) target.searchParams.set(k, v);
        return { url: target, headers: cred.headers };
      }
    });
  } catch (e) {
    if (e instanceof LinkError) throw e;
    if (e instanceof UnsafeUrlError) throw linkErrorOf(e);
    throw /timeout|abort/i.test(String(e)) ? new LinkError("The link took too long to answer.", "timeout") : new LinkError("The link could not be reached.", "network");
  }
  const { res } = got;
  if (!res.ok) throw statusError(res.status, !!cred);
  if (!res.body && !got.buf.length) throw new LinkError("The link sent nothing.", "empty");
  const final = new URL(got.url);
  const ct = res.headers.get("content-type") ?? "";
  return { buf: got.buf, name: nameOf(final, ct, res.headers.get("content-disposition") ?? ""), contentType: ct, url: final.toString(), status: res.status };
}

export function nameOf(url: URL, ct: string, cd = ""): string {
  const fromCd = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const last = (() => { try { return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? ""); } catch { return ""; } })();
  const ext = /spreadsheetml/.test(ct) ? ".xlsx" : /ms-excel/.test(ct) ? ".xls" : /json/.test(ct) ? ".json" : /rss|atom|xml/.test(ct) ? ".xml" : /html/.test(ct) ? ".html" : /csv|text\/plain/.test(ct) ? ".csv" : "";
  return (fromCd ? decodeURIComponent(fromCd) : /\.[a-z]{2,5}$/i.test(last) ? last : `${url.hostname}${last && last !== "rss" ? `-${last}` : ""}${ext || ".csv"}`).slice(0, 120);
}

/**
 * The file behind a link, the old way (one best guess): a web page is read through its own table, else a data file
 * it links, else its news feed. Kept for callers that want one file; connect/ finds every candidate.
 */
export async function fetchLink(raw: string): Promise<{ buf: Buffer; name: string; contentType: string; url: string; via: string | null }> {
  const got = await fetchOnce(raw);
  const head = got.buf.subarray(0, 4000).toString("utf8").trimStart();
  if (!(/html/i.test(got.contentType) || /^<(!doctype|html)/i.test(head))) return { ...got, via: null };
  const html = got.buf.subarray(0, 3_000_000).toString("utf8");
  const table = htmlTables(html)[0];
  if (table && table.length >= 4) return { ...got, via: "a table on the page" };
  for (const file of dataLinksIn(html, got.url)) {
    try { return { ...(await fetchOnce(file)), via: "a data file linked from the page" }; } catch { /* try the next */ }
  }
  const feedUrl = feedLinkIn(html, got.url);
  if (feedUrl && feedUrl !== got.url) {
    try { return { ...(await fetchOnce(feedUrl)), via: "the news feed the page points to" }; } catch { /* the page itself */ }
  }
  return { ...got, via: "the headlines listed on the page" };
}
