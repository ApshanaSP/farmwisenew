/**
 * Connecting a link: from an address (and, where the Collector is allowed one, a sign-in) to the tables it holds.
 *
 *   1. a plain download, with an API key or a password pop-up sign-in when given (fetchurl.ts)
 *   2. a web page: the site's robots.txt is read first; then every table, linked file, feed and headline list, and
 *      the JSON its scripts load
 *   3. a page that draws itself with JavaScript, or one behind a sign-in page: opened in a real browser
 *      (browser.ts), signing in with the kept session or the saved account, and the JSON it loads is kept too
 *   4. every candidate scored (discover.ts); the strict gate and the six outcomes are decided in resolve.ts
 *
 * Nothing is retried in disguise, no CAPTCHA or OTP is answered by a program, and a site that refuses is reported as
 * refusing. Every step is logged to the page as it happens.
 */
import { credentialsFor } from "@/lib/studio/connect/vault";
import { visit, type Visit } from "@/lib/studio/connect/browser";
import { add, discover, isHtml, jsShell, newChecked, scoreTable, type Checked, type Found } from "@/lib/studio/connect/discover";
import { adapterFor } from "@/lib/studio/connect/adapters";
import { robotsAllow } from "@/lib/studio/connect/robots";
import { fetchOnce, LinkError } from "@/lib/studio/fetchurl";
import { parseAll, ParseError } from "@/lib/studio/parse";
import type { AuthInput } from "@/lib/studio/types";

export interface Connected {
  /** what is archived as the source: the file as sent, or the page as the browser finished it */
  buf: Buffer;
  name: string;
  contentType: string;
  url: string;
  method: "http" | "browser";
  found: Found[];
  /** a browser session to keep (signed in) */
  session: string | null;
  signedIn: Visit["signedIn"] | "key" | "basic" | "none";
  /** the page as read (null for a file), for the sign-in and exploration checks */
  html?: string | null;
  title?: string | null;
  checked?: Checked;
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
/** STUDIO_BROWSER=0: never open a browser (the outcome tests, a server without one) */
const browserOn = () => process.env.STUDIO_BROWSER !== "0";

/** A file's parse failure: an empty or table-less file is "no data", a damaged one an error. */
export function fileError(e: ParseError): LinkError {
  const empty = /empty|no rows|header but no rows|no data|no tables? in it|no table the studio|has text|a scan|no list of records|no places|no columns|no articles/i.test(e.message);
  return new LinkError(e.message, empty ? "empty" : "corrupt");
}

export async function connectLink(url: string, auth: AuthInput, opts: { session?: string | null; log: (t: string) => void; checked?: Checked }): Promise<Connected> {
  const log = opts.log;
  const checked = opts.checked ?? newChecked();
  // a site whose data sits behind its own open API (AGMARKNET): read through that API, as the site itself does
  const adapter = auth.mode === "none" ? adapterFor(url) : null;
  if (adapter) {
    log(`${host(url)} serves its data through an open API: reading it there.`);
    const a = await adapter(log);
    const { score, why } = scoreTable(a.table, "api");
    const found: Found[] = [{ cand: { id: "api-1", kind: "api", label: a.label, rows: a.table.rows.length, cols: a.table.headers.length, headers: a.table.headers.slice(0, 30), score, why, url: a.url, type: "api" }, table: a.table }];
    return { buf: a.raw, name: `${host(url)}.json`, contentType: "application/json", url: a.url, method: "http", found, session: null, signedIn: "none", checked };
  }
  const browserFirst = auth.mode === "login" || auth.mode === "manual";
  const cred = credentialsFor(url, auth);

  if (!browserFirst) {
    log(`Connecting to ${host(url)}${cred ? ` with the ${auth.mode === "apikey" ? "API key" : "account"} given` : ""}…`);
    const got = await fetchOnce(url, cred);
    const signedIn: Connected["signedIn"] = auth.mode === "apikey" ? "key" : auth.mode === "basic" ? "basic" : "none";
    if (!isHtml(got.buf, got.contentType)) {
      log(`Received ${(got.buf.length / 1024).toFixed(0)} KB (${got.contentType.split(";")[0] || "a file"}).`);
      let tables;
      try { tables = parseAll(got.buf, got.name, got.contentType, got.url); } catch (e) { if (e instanceof ParseError) throw fileError(e); throw e; }
      const found: Found[] = [];
      for (const t of tables) {
        const feed = t.format === "feed";
        if (feed) checked.feeds++; else checked.files++;
        add(found, feed ? "feed" : "file", feed ? "The news feed at the link" : t.part ? `${got.name} · ${t.part}` : got.name, t, { url: got.url, source: null, bytes: got.buf.length });
      }
      if (!found.length) throw new LinkError(tables.some((t) => t.headers.length) ? "The file has its column names but no rows of data." : "The file has no rows of data.", "empty");
      return { ...got, method: "http", found, session: null, signedIn, html: null, title: null, checked };
    }
    if (!(await robotsAllow(got.url))) throw new LinkError(`${host(got.url)} asks automated readers to stay out of this page (robots.txt), so the Studio does not read it. Download the data from the page and add the file instead.`, "robots");
    const html = got.buf.toString("utf8");
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    log(`A web page${title ? `: "${title.slice(0, 80)}"` : ""}. Looking for its data…`);
    const found = await discover({ ...got, html, json: [], title }, log, cred, checked);
    const good = found.find((f) => f.cand.kind !== "headlines" && f.cand.score >= 40);
    const shell = jsShell(html);
    const page = { buf: got.buf, name: got.name, contentType: got.contentType, url: got.url, method: "http" as const, found, session: null, signedIn, html, title, checked };
    if ((good && !shell) || !browserOn()) {
      if (found.length) log(`Found ${found.length} ${found.length === 1 ? "candidate" : "candidates"} on the page.`);
      return page;
    }
    log(shell ? "The page builds its content with JavaScript: opening it in a browser." : "No clear data in the page as sent: opening it in a browser to see what it loads.");
    try {
      return await viaBrowser(url, auth, opts, found, checked);
    } catch (e) {
      // the browser could not help: what the plain page held is still worth showing (and the page itself is checked)
      log(`The browser could not add more (${(e as Error).message.slice(0, 100)}); using what the page had.`);
      return page;
    }
  }
  if (!(await robotsAllow(url))) throw new LinkError(`${host(url)} asks automated readers to stay out of this page (robots.txt), so the Studio does not sign in and read it.`, "robots");
  return viaBrowser(url, auth, opts, [], checked);
}

async function viaBrowser(url: string, auth: AuthInput, opts: { session?: string | null; log: (t: string) => void }, before: Found[], checked: Checked): Promise<Connected> {
  const log = opts.log;
  log(auth.mode === "login" ? (opts.session ? "Opening the page in a browser with the kept session…" : "Opening the page in a browser to sign in…") : auth.mode === "manual" && !opts.session ? "Opening a browser window for you to sign in…" : "Opening the page in a browser…");
  const v = await visit(url, {
    session: opts.session ?? null,
    login: auth.mode === "login" && auth.username ? { username: auth.username, password: auth.password ?? "", loginUrl: auth.loginUrl } : null,
    // a kept session first; a window only when there is none (or it has expired, below)
    manual: auth.mode === "manual" && !opts.session ? { loginUrl: auth.loginUrl } : null,
    log
  }).catch(async (e) => {
    // a manual sign-in whose session expired: open the window again
    if (auth.mode === "manual" && opts.session && e instanceof LinkError && e.code === "auth") {
      log("The kept session has expired: opening a browser window to sign in again.");
      return visit(url, { manual: { loginUrl: auth.loginUrl }, log });
    }
    throw e;
  });
  log(`The browser finished the page${v.title ? ` "${v.title.slice(0, 70)}"` : ""}; it loaded ${v.json.length} data ${v.json.length === 1 ? "response" : "responses"}.`);
  const buf = Buffer.from(v.html, "utf8");
  const found = await discover({ buf, name: `${host(v.url)}.html`, contentType: "text/html", url: v.url, html: v.html, json: v.json, title: v.title }, log, undefined, checked);
  // keep anything the plain page had that the browser did not show again
  for (const f of before) if (!found.some((g) => g.cand.label === f.cand.label && g.cand.rows === f.cand.rows)) found.push(f);
  found.sort((a, b) => b.cand.score - a.cand.score);
  if (found.length) log(`Found ${found.length} ${found.length === 1 ? "candidate" : "candidates"}.`);
  return { buf, name: `${host(v.url)}.html`, contentType: "text/html", url: v.url, method: "browser", found: found.slice(0, 60), session: v.session, signedIn: v.signedIn, html: v.html, title: v.title, checked };
}
