/**
 * The officer's search box results (the "/" palette): what /api/officer/search found, as the palette's rows (28 Nov 2026). Locked to the
 * department on the server (lib/search/history.ts officerSearch): its own grievances (the last 90 days, or the dates the search names), the
 * news filed into its own cases (any date), and only the readings its console uses (air quality, market prices, reservoirs, rain, river
 * gauges), for any day held.
 */
import type { Hit } from "@/components/collector/app/Shell";
import type { IconName } from "@/components/collector/app/icons";
import { deptIcon, fullTitle, type Row } from "@/components/collector/app/lib";
import { whenText } from "@/components/collector/app/SearchBox";
import { STAGE_LABEL, type Stage } from "@/lib/officer/stages";

const KIND: Record<string, { g: string; ic: IconName; module: string }> = {
  aqi: { g: "Air quality", ic: "wind", module: "air" }, price: { g: "Market prices", ic: "leaf", module: "markets" }, lake: { g: "Reservoirs", ic: "drop", module: "lakes" },
  rain: { g: "Rain", ic: "cloud", module: "weather" }, gauge: { g: "River gauges", ic: "line", module: "weather" }
};

export interface OfficerSearchDeps {
  api: (path: string) => Promise<any>;
  deptCode: string;
  now: string;
  openGrievance: (id: string, mode?: "off" | "news") => void;
  /** the console's panel of one module (air, markets, lakes, weather): today's readings */
  openModule: (key: string) => void;
  openNewsAll: () => void;
}

export async function officerHits(q: string, d: OfficerSearchDeps): Promise<Hit[]> {
  const r = await d.api(`/api/officer/search?q=${encodeURIComponent(q)}`);
  const now = String(r.now ?? d.now);
  const on = r.when ? ` · ${r.when.label}` : r.unread ? " · every date (the date was not read)" : "";
  const out: Hit[] = [];
  ((r.rows ?? []) as Row[]).forEach((h) => out.push({ g: `Grievances${on}`, ic: deptIcon(d.deptCode), l: fullTitle(h), s: `${STAGE_LABEL[h.stage as Stage] ?? h.stage} · ${whenText(h.t, now)}`,
    run: () => d.openGrievance(h.id) }));
  // news of the department's own cases, of any date: a click opens the case at its news
  ((r.news ?? []) as Row[]).forEach((n) => out.push({ g: `News${on}`, ic: "news", l: String(n.title),
    s: [n.publisher ?? "News", whenText(n.t, now), n.lang && n.lang !== "en" && n.titleEn ? String(n.titleEn) : null].filter(Boolean).join(" · "),
    run: () => (n.incident ? d.openGrievance(String(n.incident), "news") : n.url ? window.open(String(n.url), "_blank", "noopener") : d.openNewsAll()) }));
  // the readings the department's console uses: the value in the row; a click opens that panel (today's readings)
  ((r.values ?? []) as Row[]).forEach((v) => {
    const k = KIND[v.kind];
    if (!k) return;
    out.push({ g: k.g, ic: k.ic, l: String(v.title), s: `${v.sub}${v.generated ? " · generated data, not official" : ""}`, run: () => d.openModule(k.module) });
  });
  ((r.notes ?? []) as string[]).slice(0, 2).forEach((n) => out.push({ g: "Notes", ic: "info", l: n, run: () => undefined }));
  return out;
}
