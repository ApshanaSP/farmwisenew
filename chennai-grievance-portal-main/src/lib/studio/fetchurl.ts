/**
 * Downloading a data file from a link the Collector pastes. Share links are turned into the file itself (a Google
 * Sheet into its CSV export, Dropbox ?dl=0 into ?dl=1, a GitHub page into the raw file). Only public http(s) addresses
 * are fetched: a name that resolves to this machine or a private network is refused (no reaching into the server's
 * own network through a pasted link), redirects are followed by hand and checked the same way, and the size and time
 * are capped.
 */
import dns from "dns/promises";
import net from "net";
import { dataLinksIn, feedLinkIn, htmlTables } from "@/lib/studio/parse";

export const MAX_BYTES = 15 * 1024 * 1024;
const UA = "DistrictIQ/1.0 (Chennai District Collectorate dashboard; data studio)";
// some sites (news, government portals) answer only browsers: a refused request is retried as one
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class LinkError extends Error {}

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

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("::ffff:127.") || s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
}

async function checkHost(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new LinkError("Only http and https links can be read.");
  if (u.username || u.password) throw new LinkError("Links with a username or password in them are not accepted; add the source with its sign-in under Data sources instead.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new LinkError("That address is on a private network and cannot be read.");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => { throw new LinkError(`The address ${host} could not be found.`); })).map((x) => x.address);
  if (!ips.length || ips.some(privateIp)) throw new LinkError("That address is on a private network and cannot be read.");
}

/**
 * The file behind a link. A short share link (share.google, bit.ly) is followed through its redirects; a web page
 * that advertises a news feed (<link rel="alternate" type="application/rss+xml">) is read through that feed.
 */
export async function fetchLink(raw: string): Promise<{ buf: Buffer; name: string; contentType: string; url: string; via: string | null }> {
  const got = await fetchOnce(raw);
  const head = got.buf.subarray(0, 4000).toString("utf8").trimStart();
  if (!(/html/i.test(got.contentType) || /^<(!doctype|html)/i.test(head))) return { ...got, via: null };
  // a web page: its own table first; else a data file it links; else its news feed; else (parse.ts) its headlines
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

async function fetchOnce(raw: string): Promise<{ buf: Buffer; name: string; contentType: string; url: string }> {
  let url: URL;
  try { url = new URL(directUrl(raw)); } catch { throw new LinkError("That is not a valid link."); }
  let asBrowser = false;
  for (let hop = 0; hop < 8; hop++) {
    await checkHost(url);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", headers: { "User-Agent": asBrowser ? BROWSER_UA : UA, "Accept-Language": "en-IN,en;q=0.9", Accept: "text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*;q=0.5" },
        signal: AbortSignal.timeout(25_000), cache: "no-store" });
    } catch (e) {
      throw new LinkError(/timeout|abort/i.test(String(e)) ? "The link took too long to answer." : "The link could not be reached.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if ((res.status === 403 || res.status === 429 || res.status === 503 || res.status === 406) && !asBrowser) { asBrowser = true; hop--; continue; }
    if (res.status === 401 || res.status === 403) throw new LinkError("The link needs a sign-in. Share it publicly (\"anyone with the link\"), or download the file and drop it here.");
    if (!res.ok) throw new LinkError(`The link answered HTTP ${res.status}.`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new LinkError("The file is larger than 15 MB.");
    const reader = res.body?.getReader();
    if (!reader) throw new LinkError("The link sent nothing.");
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new LinkError("The file is larger than 15 MB."); }
      parts.push(value);
    }
    const ct = res.headers.get("content-type") ?? "";
    const cd = res.headers.get("content-disposition") ?? "";
    const fromCd = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    const ext = /spreadsheetml/.test(ct) ? ".xlsx" : /ms-excel/.test(ct) ? ".xls" : /json/.test(ct) ? ".json" : /rss|atom|xml/.test(ct) ? ".xml" : /csv|text\/plain/.test(ct) ? ".csv" : "";
    const name = (fromCd ? decodeURIComponent(fromCd) : /\.[a-z]{2,5}$/i.test(last) ? last : `${url.hostname}${last && last !== "rss" ? `-${last}` : ""}${ext || ".csv"}`).slice(0, 120);
    return { buf: Buffer.concat(parts), name, contentType: ct, url: url.toString() };
  }
  throw new LinkError("The link redirected too many times.");
}
