/**
 * The Collector's search box results (the "/" palette, Shell.tsx Palette): what /api/collector/search found, as the palette's rows
 * (28 Nov 2026: moved out of CollectorApp.tsx). The search covers every date the record holds (lib/search/history.ts): a date in the
 * search ("52 days ago", "3 October", "last week") limits every kind to those dates, and the group names say which dates they are.
 *
 *   Incidents, complaint numbers ... open the incident
 *   News ........................... the story's reports in the news preview (with each report's date), or its incident when it has one
 *   Air quality, prices, reservoirs, rain, river gauges ... the value in the row; a click shows the day's (or the span's) table with its source
 */
import type { Console } from "./CollectorApp";
import type { Story } from "./Overview";
import type { Hit } from "./Shell";
import type { IconName } from "./icons";
import { deptIcon, fullTitle, ms, rel, type Row } from "./lib";

type Api = (path: string) => Promise<any>;

const KIND: Record<string, { g: string; ic: IconName }> = {
  aqi: { g: "Air quality", ic: "wind" }, price: { g: "Market prices", ic: "leaf" }, lake: { g: "Reservoirs", ic: "drop" },
  rain: { g: "Rain", ic: "cloud" }, gauge: { g: "River gauges", ic: "line" }
};

const IST = { timeZone: "Asia/Kolkata" } as const;
/** "7 Oct", with the year when it is not this year's: "7 Oct 2025" */
export function dayOf(t: string, now: string): string {
  const a = ms(t), b = ms(now);
  if (!Number.isFinite(a)) return String(t ?? "").slice(0, 10);
  const sameYear = new Date(a).toLocaleDateString("en-GB", { ...IST, year: "numeric" }) === new Date(b).toLocaleDateString("en-GB", { ...IST, year: "numeric" });
  return new Date(a).toLocaleDateString("en-GB", { ...IST, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
/** a report's or an incident's time in the row: "7 Oct · 52 days ago", "today, 3 hrs ago" */
export const whenText = (t: string, now: string) => (Number.isFinite(ms(t)) ? `${dayOf(t, now) === dayOf(now, now) ? "today" : dayOf(t, now)} · ${rel(t, now)}` : "");

/** A news hit as the news preview takes it (the fields the preview reads; the rest as a story with no desk reading). */
export function storyOf(n: Row): Story {
  const tamil = n.lang && n.lang !== "en" && n.titleEn;
  return { id: String(n.id), title: String(tamil ? n.titleEn : n.title), original: tamil ? String(n.title) : null, url: n.url ?? null, loc: n.place ?? null,
    t: String(n.t), incident: n.incident ?? null, sev: null, grievances: 0, complaints: 0, outletNames: [], docIds: (n.docIds as string[] | undefined)?.length ? n.docIds : [String(n.id)],
    headlines: (n.docIds as string[] | undefined)?.length ?? 1, topic: null } as unknown as Story;
}

const cell = (v: unknown) => String(v ?? "–").replace(/\|/g, "/").replace(/\s+/g, " ");

/** What the search looked at, for the text window: the dates, the words, and every note. */
function aboutMd(r: Row, q: string): string {
  const lines = [`**Searched:** “${q}”`];
  if (r.when) lines.push(`**Dates:** ${r.when.label}${r.when.partial ? ", up to now" : ""}. Incidents by the day first reported, news by the day published, readings by the day measured.`);
  else if (r.unread) lines.push("**Dates:** a time was named that the search could not place, so every date the record holds was searched. Write it as 3 October, 7/10/2026, 52 days ago, last week or October.");
  else lines.push("**Dates:** every date the record holds (news from August 2026; air quality from late September 2026).");
  if (r.topic) lines.push(`**Words looked for:** ${r.topic} (every word, in any order; Tamil headlines are also matched by their English translation).`);
  for (const n of (r.notes ?? []) as string[]) lines.push(`- ${n}`);
  lines.push("", "The dashboard's filters do not apply to the search.");
  return lines.join("\n\n");
}

/** Every story past the ones shown, as a table with links (the text window). */
function moreNewsMd(r: Row, q: string, now: string): string {
  const rows = ((r.newsRest ?? []) as Row[]).map((n) => [dayOf(n.t, now), n.publisher ?? "News", n.url ? `[${cell(n.title)}](${n.url})` : cell(n.title), n.titleEn && n.titleEn !== n.title ? cell(n.titleEn) : ""]);
  return `${r.newsMore ? "Over " : ""}${Number(r.newsTotal)} stories match “${q}”${r.when ? `, ${r.when.label}` : ""}. The best ${(r.news ?? []).length} are in the search; the next ${rows.length} are here, best match first (the words in the headline, then the newest).\n\n` +
    ["| Day | Outlet | Headline | In English |", "| --- | --- | --- | --- |", ...rows.map((x) => `| ${x.join(" | ")} |`)].join("\n");
}

/** The search's results as palette rows. `api`: the console's fetch (it sends an ended session to sign-in). */
export async function collectorHits(q: string, c: Console, api: Api): Promise<Hit[]> {
  const r = await api(`/api/collector/search?q=${encodeURIComponent(q)}`);
  const now = String(r.now ?? c.now);
  const out: Hit[] = [];
  const on = r.when ? ` · ${r.when.label}` : "";
  // the dates the search read, first: every group below is of them
  if (r.when) out.push({ g: "Dates", ic: "cal", l: `Searching ${r.when.label}`, s: "Incidents, news and readings of these dates. The dashboard filters do not apply", run: () => c.showText("What the search looked at", aboutMd(r, q)) });
  else if (r.unread) out.push({ g: "Dates", ic: "cal", l: "The date was not read: every date is searched", s: "Write it as 3 October, 7/10/2026, 52 days ago, last week or October", run: () => c.showText("What the search looked at", aboutMd(r, q)) });
  (r.zones ?? []).forEach((z: Row) => out.push({ g: "Zones", ic: "pin", l: z.name, s: `${z.open} open incidents`, run: () => c.setZone(z.zone) }));
  (r.depts ?? []).forEach((d: Row) => out.push({ g: "Departments", ic: deptIcon(d.code), l: d.name, s: d.org, run: () => c.setDept(d.code) }));
  (r.incidents ?? []).forEach((i: Row) => out.push({ g: `Incidents${on}`, ic: deptIcon(i.dept), l: fullTitle(i), s: `${i.zone_name ?? "Chennai"} · ${whenText(i.t, now)}`, run: () => c.openInc(i.id) }));
  // more matches than shown: the full list with the same words (R-21), of every date as the search is (the list's own period showed fewer
  // than the count said); the list has no dates of its own, so a dated search says so
  if (Number(r.incidentsTotal) > (r.incidents ?? []).length)
    out.push({ g: `Incidents${on}`, ic: "table", l: `${Number(r.incidentsTotal) - r.incidents.length} more matching incidents${r.when ? " in these dates" : ""}`,
      s: r.when ? "Open the list with these words (the list shows every date)" : "Open them all in the list",
      run: () => c.openList({ q: r.topic || q, anyZone: true, scope: "all" }, `Incidents matching “${r.topic || q}”`) });
  // a citizen's complaint number opens the incident it was filed into
  (r.complaints ?? []).forEach((x: Row) => out.push({ g: "Complaint number", ic: "chat", l: `${x.code}: ${x.title ?? "incident"}`, s: "The incident this complaint was filed into", run: () => c.openInc(x.id) }));
  // news of any date: the headline as published (Tamil or English), the outlet and the day; a click opens the story's reports
  (r.news ?? []).forEach((n: Row) => out.push({ g: `News${on}`, ic: "news", l: String(n.title),
    s: [n.publisher ?? "News", whenText(n.t, now), Number(n.outlets) > 1 ? `${n.outlets} outlets` : null, n.lang && n.lang !== "en" && n.titleEn ? String(n.titleEn) : null].filter(Boolean).join(" · "),
    run: () => c.openStory(storyOf(n)) }));
  if ((r.newsRest ?? []).length)
    out.push({ g: `News${on}`, ic: "table", l: `${r.newsMore ? "Over " : ""}${Number(r.newsTotal) - (r.news ?? []).length} more matching stories`, s: "The next matches, with their day, outlet and link",
      run: () => c.showText(`News matching “${r.topic || q}”`, moreNewsMd(r, r.topic || q, now)) });
  // readings of the day or the span the search names: the value in the row, the table behind it on a click
  (r.values ?? []).forEach((v: Row) => {
    const k = KIND[v.kind] ?? { g: "Readings", ic: "chart" as IconName };
    out.push({ g: k.g, ic: k.ic, l: String(v.title), s: `${v.sub}${v.generated ? " · generated data, not official" : ""}`,
      run: () => (v.table ? c.showText(v.table.title, String(v.table.md)) : v.open?.markets ? c.openMarkets() : c.setPage("environment")) });
  });
  // what the search could not find, or found nearby instead ("no station in Alandur; the nearest is ..."): one row, the notes in the text window
  const notes = (r.notes ?? []) as string[];
  if (notes.length) out.push({ g: "Notes", ic: "info", l: notes[0], s: notes.length > 1 ? `${notes.length - 1} more note${notes.length > 2 ? "s" : ""} · what the search looked at` : "What the search looked at",
    run: () => c.showText("What the search looked at", aboutMd(r, q)) });
  (r.sources ?? []).forEach((x: Row) => out.push({ g: "Data sources", ic: "sensor", l: String(x.name), s: String(x.kind ?? ""), run: c.openFeeds }));
  // a Data Studio dataset opens on the Data Studio page (Studio remembers which dataset to show)
  (r.datasets ?? []).forEach((d: Row) => out.push({ g: "Data Studio", ic: "spark", l: String(d.name), s: `${Number(d.rows).toLocaleString("en-IN")} rows`,
    // the Studio reads the request when it opens; when it is open already, the event switches it at once
    run: () => { try { localStorage.setItem("diq-studio-sel", String(d.id)); } catch { /* not saved */ } c.setPage("studio"); window.dispatchEvent(new CustomEvent("diq:studio-open", { detail: String(d.id) })); } }));
  return out;
}
