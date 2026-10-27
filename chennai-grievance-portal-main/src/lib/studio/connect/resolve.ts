/**
 * The link engine: any link ends in exactly one of six honest outcomes (and a seventh, "you already have this"):
 *
 *   DATA          exactly one candidate passes the strict gate (gate.ts: real table, enough rows, Chennai's)
 *   CHOOSE        two or more candidates are real data tables: the Collector picks (picker); never an auto-pick
 *   NO DATA       nothing is a real data table with enough rows: an article, a home page, a video, a menu, 1-5 rows
 *   NOT RELEVANT  real data, but not Chennai's: a preview, and "Use anyway" (a warning banner on that dataset)
 *   BLOCKED       a sign-in, a CAPTCHA, robots.txt, an API key needed, a dashboard that cannot be downloaded
 *   ERROR         404, 500, a timeout, too big, a damaged file, an address that may not be read, a redirect loop
 *   DUPLICATE     the same data is already in the Studio: open it, or refresh it instead
 *
 * Each outcome says what was checked and the best next step. Code decides every outcome; nothing is guessed.
 */
import crypto from "crypto";
import { connectLink, type Connected } from "@/lib/studio/connect";
import { newChecked, schemaHash, tableHash, type Checked, type Found } from "@/lib/studio/connect/discover";
import { explore } from "@/lib/studio/connect/explore";
import { gateA, quickRelevance, type GateA, type QuickRel } from "@/lib/studio/connect/gate";
import { classify, platform } from "@/lib/studio/connect/platforms";
import { robotsAllow } from "@/lib/studio/connect/robots";
import { seriesTitle } from "@/lib/studio/connect/series";
import { credentialsFor } from "@/lib/studio/connect/vault";
import { LinkError, fetchOnce } from "@/lib/studio/fetchurl";
import type { Table } from "@/lib/studio/parse";
import { earns, readiness, type Readiness } from "@/lib/studio/readiness";
import { datasetIds, findBySource, getMeta } from "@/lib/studio/store";
import type { AuthInput, Outcome, OutcomeAction, PickCard, PickGroup, PickSet } from "@/lib/studio/types";
import { fmtDay, parseDate } from "@/lib/studio/values";

/** An outcome that ends a run without a dashboard (the stream sends it as its own screen). */
export class OutcomeStop extends Error {
  constructor(public outcome: Outcome) { super(outcome.why); }
}

export interface GateInfo { a: GateA; r: Readiness; rel: QuickRel; ok: boolean }
export interface Resolved { outcome: Outcome; found: Found[]; gates: Map<string, GateInfo>; connected: Connected | null; chosen: Found | null }

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** "Read the page: 2 tables, 0 data files, 0 feeds", and what could not be read. */
export function checkedLines(c: Checked, explored: number): string[] {
  const out = [`${c.pages > 1 || explored ? `Read ${plural(c.pages, "page")} of the site` : c.pages ? "Read the page" : "Read the file"}: ${plural(c.tables, "table")}, ${plural(c.files, "data file")}, ${plural(c.feeds, "feed")}${c.json ? `, ${plural(c.json, "data response")}` : ""}.`];
  if (explored) out.push(`Followed ${plural(explored, "link")} on the site that looked like data.`);
  for (const f of c.failed.slice(0, 5)) out.push(`Could not read ${f.label.slice(0, 80)}: ${f.why}`);
  if (c.failed.length > 5) out.push(`…and ${c.failed.length - 5} more that could not be read.`);
  return out;
}

/** The outcome for a refusal or failure while reading. */
export function outcomeOfError(e: unknown, url: string | null, checked: Checked): Outcome {
  const le = e instanceof LinkError ? e : null;
  const msg = (e as Error)?.message ?? String(e);
  const where = url ? hostOf(url) : "the link";
  // what was tried, in words, even when nothing could be read
  const tried: Record<string, string> = {
    private: "Checked the address before reading: it is this computer or a private network.", invalid: "Checked the link: it is not an http or https address.",
    missing: `Asked ${where} for the page: it answered that nothing is there.`, timeout: `Waited for ${where}: it did not answer in time.`, network: `Tried to reach ${where}: it could not be reached.`,
    size: `Started reading from ${where}: the file is larger than the Studio reads.`, redirects: `Followed ${where}'s redirects: they lead round in a loop.`,
    corrupt: "Read the file: it is damaged or not the kind its name says.", http: `Asked ${where} for the page: it answered with an error.`, limited: `Asked ${where}: it is limiting readers right now.`,
    robots: `Read ${where}'s robots.txt.`, auth: `Asked ${where} for the page: it wants a sign-in.`, login: `Opened ${where}: it wants a sign-in.`, forbidden: `Asked ${where} for the page: it refused.`,
    empty: "Read the file.", browser: "Tried to open the page in a browser."
  };
  const lines = [...(checked.pages || checked.files ? checkedLines(checked, 0) : []), ...(le && tried[le.code] && !(checked.pages || checked.files) ? [tried[le.code]] : [])];
  if (!le) lines.push(`Tried to read ${where}.`);
  const retry: OutcomeAction = { label: "Try again", act: "retry" };
  const file: OutcomeAction = { label: "Add the file instead", act: "file" };
  if (le) switch (le.code) {
    case "robots": return { kind: "blocked", reason: "robots", why: msg, checked: [...lines.filter((l) => !/robots\.txt\.$/.test(l)), "Read the site's robots.txt: it asks automated readers to stay out."], next: [file], url };
    case "auth": case "login": return { kind: "blocked", reason: "login", why: msg, checked: lines, next: [{ label: "Add sign-in details", act: "vault" }, file], url };
    case "forbidden": return { kind: "blocked", reason: "forbidden", why: msg, checked: lines, next: [{ label: "Add sign-in details", act: "vault" }, file], url };
    case "limited": return { kind: "error", reason: "429", why: msg, checked: lines, next: [retry], url };
    case "missing": return { kind: "error", reason: "404", why: msg, checked: lines, next: [{ label: "Check the link", act: "link" }], url };
    case "timeout": return { kind: "error", reason: "timeout", why: msg, checked: lines, next: [retry, file], url };
    case "network": return { kind: "error", reason: "network", why: msg, checked: lines, next: [retry], url };
    case "size": return { kind: "error", reason: "size", why: `${msg} The Studio reads files up to 15 MB.`, checked: lines, next: [{ label: "Add a smaller extract (one year, or one zone)", act: "file" }], url };
    case "private": return { kind: "error", reason: "private", why: "That address is on this computer or a private network, so the Studio does not read it (a safety rule).", checked: lines, next: [{ label: "Use a public link", act: "link" }], url };
    case "invalid": return { kind: "error", reason: "invalid", why: msg, checked: lines, next: [{ label: "Check the link", act: "link" }], url };
    case "redirects": return { kind: "error", reason: "loop", why: msg, checked: lines, next: [{ label: "Check the link", act: "link" }], url };
    case "corrupt": return { kind: "error", reason: "corrupt", why: msg, checked: lines, next: [{ label: "Ask for the file again, or save it again as .xlsx or .csv", act: "file" }], url };
    case "empty": return { kind: "nodata", reason: "empty", why: msg, checked: lines, next: [{ label: "Ask the department for the full file", act: "file" }], url };
    case "http": return { kind: "error", reason: le.status && le.status >= 500 ? "500" : "http", why: msg, checked: lines, next: le.status && le.status >= 500 ? [retry] : [{ label: "Check the link", act: "link" }], url };
    case "browser": return { kind: "error", reason: "browser", why: msg, checked: lines, next: [file], url };
  }
  return { kind: "error", reason: "unknown", why: `Something went wrong while reading the link: ${msg.slice(0, 160)}`, checked: lines, next: [retry], url };
}

/** The first and last date in a table's date column (for a card). */
export function dateRangeOf(t: Table): { from: string; to: string } | null {
  let best: { from: string; to: string; n: number } | null = null;
  t.headers.forEach((_, i) => {
    const ds: string[] = [];
    for (const r of t.rows.slice(0, 5000)) { const c = r[i]; if (typeof c === "string") { const d = parseDate(c); if (d) ds.push(d.slice(0, 10)); } }
    if (ds.length < Math.max(2, t.rows.length * 0.5)) return;
    ds.sort();
    if (!best || ds.length > best.n) best = { from: ds[0], to: ds[ds.length - 1], n: ds.length };
  });
  const b = best as { from: string; to: string; n: number } | null;
  return b ? { from: b.from, to: b.to } : null;
}

/** A page that reads as an article or a blog post (one story, many paragraphs). */
function articleLike(html: string): boolean {
  if (/<meta[^>]+property=["']og:type["'][^>]+content=["']article["']/i.test(html) || /<meta[^>]+content=["']article["'][^>]+property=["']og:type["']/i.test(html)) return true;
  // paragraphs, split by hand (no backtracking on unclosed tags)
  const paras = html.slice(0, 3_000_000).split(/<p\b/i).slice(1, 400).map((x) => x.split(/<\/p>/i)[0].slice(0, 5000).replace(/<[^>]+>/g, " ").trim()).filter((p) => p.split(/\s+/).length >= 20);
  return /<article\b/i.test(html) ? paras.length >= 3 : paras.length >= 6;
}
const loginPage = (html: string) => /<input\b[^>]*type\s*=\s*["']?password/i.test(html);
const captchaPage = (html: string) => /g-recaptcha|h-captcha|hcaptcha\.com|cf-turnstile|challenges\.cloudflare\.com|challenge-platform|verify you are (a )?human|are you a robot|enter the (characters|text) (you see|shown)|captcha/i.test(html);

/** The Studio's datasets that hold the same table (by content), or the same link with the same columns. */
export function findDuplicate(url: string | null, buf: Buffer | null, t: Table | null): Outcome["dupOf"] {
  if (buf) { const m = findBySource(buf); if (m) return { id: m.id, name: m.name, addedAt: m.createdAt, link: !!m.source.url }; }
  if (!t) return null;
  const hash = tableHash(t);
  const schema = schemaHash(t.headers);
  for (const id of datasetIds()) {
    const m = getMeta(id);
    const c = m?.source.connect;
    if (!m) continue;
    if (c?.hash === hash) return { id: m.id, name: m.name, addedAt: m.createdAt, link: !!m.source.url };
    if (url && m.source.url === url && c?.candidates.some((x) => x.id === c.choice && (x.schema ?? schemaHash(x.headers)) === schema)) return { id: m.id, name: m.name, addedAt: m.createdAt, link: true };
  }
  return null;
}

export function duplicateOutcome(dup: NonNullable<Outcome["dupOf"]>, url: string | null): Outcome {
  return {
    kind: "duplicate", reason: "duplicate", url, dupOf: dup,
    why: `You already have this: "${dup.name}", added ${fmtDay(dup.addedAt.slice(0, 10))}.${dup.link ? " Refresh it instead to bring in what is new." : ""}`,
    checked: ["Compared its content and columns with every dataset in the Studio."],
    next: [...(dup.link ? [{ label: "Refresh it instead", act: "refresh" as const }] : []), { label: "Open it", act: "open" }]
  };
}

const preview = (t: Table) => ({ headers: t.headers.slice(0, 8), rows: t.rows.slice(0, 5).map((r) => r.slice(0, 8)) });

/** The picker's cards, in its groups (recommended, series, other, not Chennai's, could not read). */
export function pickCards(found: Found[], gates: Map<string, GateInfo>, checked: Checked, page: string): PickCard[] {
  const cards: PickCard[] = [];
  for (const f of found) {
    const g = gates.get(f.cand.id);
    if (!g?.a.ok) continue;
    const c = f.cand;
    const range = dateRangeOf(f.table);
    const s = c.series;
    const group: PickGroup = g.rel.verdict === "unrelated" ? "notchennai" : s ? "series" : g.ok && (g.rel.chennaiRows > 0 || g.rel.verdict === "district") ? "recommended" : "other";
    const why = group === "notchennai" ? g.rel.why
      : !earns(g.r.tier) ? `Only ${plural(g.r.rows, "row")}: too few for charts (a fact card)`
      : g.rel.why.replace(/\.$/, "");
    cards.push({
      id: c.id, name: s ? `${seriesTitle({ pattern: s.pattern, step: "day" })}` : c.label, type: c.type ?? "csv", source: c.source ?? page, url: c.url ?? null,
      rows: c.rows, cols: c.cols, headers: c.headers.slice(0, 12), dateRange: range, chennaiRows: g.rel.chennaiRows, updated: c.updated ?? null, bytes: c.bytes ?? null,
      group, why, schema: c.schema ?? schemaHash(c.headers), tier: g.r.tier,
      series: s ? { files: s.files.length, from: s.from, to: s.to, pattern: s.pattern, title: seriesTitle({ pattern: s.pattern, step: s.files.length > 1 && (Date.parse(s.files[1].date) - Date.parse(s.files[0].date)) / 864e5 === 1 ? "day" : "other" }) } : null
    });
  }
  for (const f of checked.failed) cards.push({ id: `x-${crypto.createHash("sha1").update(f.label).digest("hex").slice(0, 8)}`, name: f.label, type: "csv", source: page, url: null, rows: 0, cols: 0, headers: [],
    dateRange: null, chennaiRows: null, updated: null, bytes: null, group: "unreadable", why: f.why, schema: null, tier: "empty" });
  const order: PickGroup[] = ["recommended", "series", "other", "notchennai", "unreadable"];
  return cards.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (b.chennaiRows ?? 0) - (a.chennaiRows ?? 0) || b.rows - a.rows);
}

/** Every candidate through the strict gate. */
export function gateAll(found: Found[], ctx: { url: string; title: string | null; linkIsFeed: boolean }): Map<string, GateInfo> {
  const gates = new Map<string, GateInfo>();
  for (const f of found) {
    const a = gateA(f, ctx.linkIsFeed);
    const rel = quickRelevance(f.table, { url: f.cand.url ?? ctx.url, title: f.table.caption ?? ctx.title });
    // a Tamil Nadu table is measured whole: Chennai is shown against the state
    let r = readiness(f.table);
    // a series is measured as its files together (6 reservoirs a day over 27 days is a time series, not 6 rows)
    const n = f.cand.series?.files.length ?? 1;
    if (n >= 3 && r.tier !== "empty" && r.rows * n > 20) r = { ...r, periods: Math.max(r.periods, n), tier: "full", summary: `${r.summary} · ${n} files` };
    gates.set(f.cand.id, { a, r, rel, ok: a.ok && earns(r.tier) && rel.verdict !== "unrelated" });
  }
  return gates;
}

/** Why there is no data, and the best next step, from what the page was. */
function noData(found: Found[], gates: Map<string, GateInfo>, c: Connected | null, url: string, checked: Checked, explored: number): Outcome {
  const html = c?.html ?? null;
  const lines = checkedLines(checked, explored);
  const passA = found.filter((f) => gates.get(f.cand.id)?.a.ok);
  const rejected = found.filter((f) => !gates.get(f.cand.id)?.a.ok).slice(0, 3).map((f) => `${f.cand.label}: ${gates.get(f.cand.id)?.a.why ?? "not data"}`);
  lines.push(...rejected.map((r) => `Not used: ${r}.`));
  const thin = passA[0];
  if (thin) {
    const g = gates.get(thin.cand.id)!;
    return { kind: "nodata", reason: "thin", url, checked: lines, preview: preview(thin.table),
      why: `It holds only one small table (${g.r.summary}): too little to chart honestly.`,
      next: [{ label: "Find more on this site", act: "link", href: url }, { label: "Add a fuller file", act: "file" }] };
  }
  const headlines = found.some((f) => f.cand.kind === "headlines" || f.cand.kind === "feed");
  if (html && (articleLike(html) || headlines)) return { kind: "nodata", reason: "news", url, checked: lines,
    why: headlines && !articleLike(html) ? "This page lists news headlines, not a data table." : "This reads as a news story or article, not a data table.",
    next: [{ label: "Add it to News instead", act: "news", href: url }, { label: "Try this site's Downloads or Data page", act: "link" }] };
  if (c && !html) return { kind: "nodata", reason: "empty", url, checked: lines, why: "The file has no table with rows of data in it.", next: [{ label: "Ask the department for the full file", act: "file" }] };
  const menus = found.some((f) => /menu|layout|links/.test(gates.get(f.cand.id)?.a.why ?? ""));
  return { kind: "nodata", reason: menus ? "menu" : html && /<script\b/i.test(html) && html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").trim().length < 400 ? "jsapp" : "page", url, checked: lines,
    why: menus ? "The only tables on this page are its menus and layout, not data." : "No data to chart here: no table, data file or feed with data in it.",
    next: [{ label: `Try ${hostOf(url)}'s Downloads or Data page`, act: "link" }, { label: "Add a file instead", act: "file" }] };
}

export interface ResolveOpts { session?: string | null; log: (t: string) => void; explore?: boolean }

/** A link to its outcome: read it, gate every candidate, and say what it is. */
export async function resolveLink(url: string, auth: AuthInput, opts: ResolveOpts): Promise<Resolved> {
  const { log } = opts;
  const checked = newChecked();
  const done = (outcome: Outcome, found: Found[] = [], gates = new Map<string, GateInfo>(), connected: Connected | null = null, chosen: Found | null = null): Resolved => ({ outcome, found, gates, connected, chosen });
  let u: URL;
  try { u = new URL(url); } catch { return done(outcomeOfError(new LinkError("That is not a valid link.", "invalid"), url, checked)); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return done(outcomeOfError(new LinkError("Only http and https links can be read.", "invalid"), url, checked));

  // known from the address alone
  const known = classify(url, auth.mode === "apikey" && !!auth.key);
  if (known) {
    const next: OutcomeAction[] = known.kind === "blocked" && known.reason === "key" ? [{ label: "Add the API key", act: "vault" }] : known.reason === "social" ? [{ label: "Add it to News instead", act: "news", href: url }] : [{ label: "Paste another link", act: "link" }];
    const lines = ["Recognised the site from its address: nothing was downloaded."];
    if (known.kind === "blocked" && known.reason === "key") {
      // the page's own download link, when it shows one
      try {
        if (!(await robotsAllow(url))) throw new Error("robots");
        const f = await fetchOnce(url, null, "text/html", 12_000);
        const dl = [...f.buf.toString("utf8").matchAll(/<a\b[^>]*href=["']([^"'#]+\.(?:csv|xlsx?|json)(?:\?[^"']*)?)["']/gi)].map((m) => new URL(m[1], f.url).toString())[0];
        if (dl) { next.push({ label: "Use the page's download link", act: "link", href: dl }); lines.push("The page shows a download link: it can be added directly."); }
      } catch { /* the key is the way */ }
    }
    return done({ kind: known.kind, reason: known.reason, why: known.why, checked: lines, next: [...next, { label: known.next, act: "close" as const }].slice(0, 3), url });
  }

  const cred = credentialsFor(url, auth);
  let found: Found[] = [];
  let connected: Connected | null = null;
  try {
    const p = auth.mode === "none" || auth.mode === "apikey" ? await platform(url, cred, log) : null;
    if (p) {
      checked.pages++;
      checked.files += p.found.length;
      checked.failed.push(...p.skipped);
      found = p.found;
      connected = { buf: p.raw, name: `${hostOf(url)}.json`, contentType: "application/json", url, method: "http", found, session: null, signedIn: auth.mode === "apikey" ? "key" : "none", html: null, title: p.title, checked };
    } else {
      connected = await connectLink(url, auth, { session: opts.session ?? null, log, checked });
      found = connected.found;
    }
  } catch (e) {
    return done(outcomeOfError(e, url, checked));
  }
  const linkIsFeed = !connected.html && found.some((f) => f.cand.kind === "feed");
  let gates = gateAll(found, { url, title: connected.title ?? null, linkIsFeed });
  let passA = found.filter((f) => gates.get(f.cand.id)!.a.ok);
  let explored = 0;

  // a page with no data of its own: a sign-in or a CAPTCHA first, else the site's own links
  if (!passA.length && connected.html) {
    if (captchaPage(connected.html)) return done({ kind: "blocked", reason: "captcha", url, checked: checkedLines(checked, 0),
      why: "The site asks to prove a person is reading (a CAPTCHA). The Studio never answers one.", next: [{ label: "Sign in yourself (I'll sign in myself)", act: "vault" }, { label: "Add the file instead", act: "file" }] }, found, gates, connected);
    if (opts.explore !== false) {
      const before = checked.pages;
      try {
        const more = await explore({ html: connected.html, url: connected.url }, { cred, log, checked, linkIsFeed });
        explored = checked.pages - before;
        for (const m of more) { m.cand.id = `${m.cand.kind}-${found.length + 1}`; found.push(m); }
      } catch (e) { log(`Exploring the site stopped: ${(e as Error).message.slice(0, 100)}`); explored = checked.pages - before; }
      gates = gateAll(found, { url, title: connected.title ?? null, linkIsFeed });
      passA = found.filter((f) => gates.get(f.cand.id)!.a.ok);
    }
  }
  // still nothing, and the page holds a sign-in form: it is the sign-in that stands between the Studio and the data
  if (!passA.length && connected.html && loginPage(connected.html)) return done({ kind: "blocked", reason: "login", url, checked: checkedLines(checked, explored),
    why: "The page asks for a sign-in, and nothing on the site is readable without it.", next: [{ label: "Add sign-in details", act: "vault" }, { label: "Add the file instead", act: "file" }] }, found, gates, connected);
  const lines = checkedLines(checked, explored);
  if (!passA.length) return done(noData(found, gates, connected, url, checked, explored), found, gates, connected);
  const passAll = passA.filter((f) => gates.get(f.cand.id)!.ok);
  const series = passA.some((f) => f.cand.series && f.cand.series.files.length >= 3);
  const relevant = passA.filter((f) => gates.get(f.cand.id)!.rel.verdict !== "unrelated");

  // two or more real data tables (or a series of dated files), at least one of them Chennai's with enough rows: the
  // Collector chooses (the others are shown in their own groups)
  // (a small side table, "Last updated: ...", is not a second dataset: two must each have enough rows)
  const sizable = passA.filter((f) => earns(gates.get(f.cand.id)!.r.tier));
  if ((sizable.length >= 2 || series) && relevant.some((f) => earns(gates.get(f.cand.id)!.r.tier))) {
    const cards = pickCards(found, gates, checked, connected.url);
    const real = cards.filter((c) => c.group !== "unreadable").length;
    log(`Found ${plural(real, "dataset")} on this link: the choice is yours.`);
    const pick: PickSet = { token: "", url, title: connected.title ?? hostOf(url), cards, at: new Date().toISOString() };
    return done({ kind: "choose", reason: series && passA.length === 1 ? "series" : "many", url, checked: lines, pick,
      why: `We found ${plural(real, "dataset")} ${connected.html ? "on this site" : "in this file"}. Which ones do you want?`, next: [] }, found, gates, connected);
  }
  // none of them is Chennai's: the best real one is shown as NOT RELEVANT
  const one = passAll[0] ?? relevant[0] ?? [...passA].sort((x, y) => (earns(gates.get(y.cand.id)!.r.tier) ? 1 : 0) - (earns(gates.get(x.cand.id)!.r.tier) ? 1 : 0) || y.cand.score - x.cand.score)[0];
  const g = gates.get(one.cand.id)!;
  if (!earns(g.r.tier)) return done(noData(found, gates, connected, url, checked, explored), found, gates, connected);
  if (g.rel.verdict === "unrelated") return done({ kind: "notrelevant", reason: "unrelated", url, checked: [...lines, `Checked for Chennai: ${g.rel.why}`], preview: preview(one.table),
    why: `This is real data, but not about Chennai: ${g.rel.why.charAt(0).toLowerCase()}${g.rel.why.slice(1)}`, next: [{ label: "Use anyway", act: "useAnyway" }, { label: "Paste another link", act: "link" }] }, found, gates, connected, one);
  const dup = findDuplicate(url, connected.html ? null : connected.buf, one.table);
  if (dup) return done(duplicateOutcome(dup, url), found, gates, connected, one);
  return done({ kind: "data", reason: g.rel.verdict, url, checked: [...lines, `Checked for Chennai: ${g.rel.why}`, `Enough to chart: ${g.r.summary}.`], why: "", next: [] }, found, gates, connected, one);
}

/**
 * A link read again (a refresh): through the same platform API or page as the first time, and the site's own links
 * when the page alone has no data. The Collector's choice is then found by its columns (discover.ts choose()).
 */
export async function readLink(url: string, auth: AuthInput, opts: ResolveOpts): Promise<Connected> {
  const checked = newChecked();
  const cred = credentialsFor(url, auth);
  const p = auth.mode === "none" || auth.mode === "apikey" ? await platform(url, cred, opts.log) : null;
  if (p) return { buf: p.raw, name: `${hostOf(url)}.json`, contentType: "application/json", url, method: "http", found: p.found, session: null, signedIn: auth.mode === "apikey" ? "key" : "none", html: null, title: p.title, checked };
  const c = await connectLink(url, auth, { session: opts.session ?? null, log: opts.log, checked });
  const linkIsFeed = !c.html && c.found.some((f) => f.cand.kind === "feed");
  if (c.html && !c.found.some((f) => gateA(f, linkIsFeed).ok)) {
    try {
      const more = await explore({ html: c.html, url: c.url }, { cred, log: opts.log, checked, linkIsFeed });
      for (const m of more) { m.cand.id = `${m.cand.kind}-${c.found.length + 1}`; c.found.push(m); }
    } catch (e) { opts.log(`Exploring the site stopped: ${(e as Error).message.slice(0, 100)}`); }
  }
  if (!c.found.length) throw new LinkError("Nothing to read at that link now: no table, data file or feed.", "empty");
  return c;
}
