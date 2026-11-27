/**
 * Which outlets are official record news (newspapers, TV news channels, news agencies, government sources): pure, no store, so the
 * browser's Jarvis code may use it (v6: lib/thunai/screens.ts, which the console's bundle holds). Moved from newsrel.ts unchanged;
 * newsrel.ts re-exports it.
 */
export type MediaKind = "newspaper" | "tv" | "agency" | "government";
const K = (kind: MediaKind, list: string[]) => list.map((x) => [x, kind] as const);
const MEDIA_DOMAINS = new Map<string, MediaKind>([
  ...K("newspaper", ["thehindu.com", "tamil.thehindu.com", "hindutamil.in", "timesofindia.indiatimes.com", "dtnext.in", "newindianexpress.com",
    "indianexpress.com", "tamil.indianexpress.com", "deccanchronicle.com", "deccanherald.com", "hindustantimes.com",
    "economictimes.indiatimes.com", "m.economictimes.com", "livemint.com", "business-standard.com", "thehindubusinessline.com",
    "dailythanthi.com", "dinamalar.com", "dinamani.com", "dinakaran.com", "m.dinakaran.com", "maalaimalar.com", "makkalkural.net",
    "malaimurasu.com", "english.mathrubhumi.com", "freepressjournal.in",
    // established Tamil outlets (27 Nov 2026, the owner): magazines and news sites of established groups
    "vikatan.com", "tamil.samayam.com", "tamil.oneindia.com", "minnambalam.com", "nakkheeran.in"]),
  ...K("tv", ["ndtv.com", "indiatoday.in", "news18.com", "tamil.news18.com", "timesnownews.com", "wionews.com", "zeenews.india.com",
    "bbc.com", "bbc.co.uk", "thanthitv.com", "polimernews.com", "puthiyathalaimurai.com", "sunnews.tv", "news7tamil.live",
    "kalaignarseithigal.com", "etvbharat.com", "ddnews.gov.in", "newsonair.gov.in",
    // the Tamil sites of TV news networks (27 Nov 2026)
    "tamil.abplive.com", "tamil.timesnownews.com", "tamil.asianetnews.com"]),
  ...K("agency", ["ptinews.com", "aninews.in", "ianslive.in", "uniindia.com"]),
  ...K("government", ["pib.gov.in", "chennaifloodmonitor.tn.gov.in", "chennaicorporation.gov.in", "tn.gov.in", "mausam.imd.gov.in", "pwd"])
]);
const MEDIA_NAMES = new Map<string, MediaKind>([
  ...K("newspaper", ["the hindu", "hindu tamil thisai", "the times of india", "dt next", "the new indian express", "the indian express",
    "deccan chronicle", "deccan herald", "hindustan times", "the economic times", "mint", "business standard", "businessline",
    "daily thanthi", "dinamalar", "dinamani", "dinakaran", "maalaimalar", "makkal kural", "malai murasu", "mathrubhumi english",
    "free press journal", "vikatan", "ananda vikatan", "samayam tamil", "oneindia tamil", "minnambalam", "nakkheeran"]),
  ...K("tv", ["ndtv", "india today", "news18", "news18 tamil", "news18 tamil nadu", "times now", "wion", "zee news", "bbc", "bbc tamil",
    "thanthi tv", "polimer news", "puthiya thalaimurai", "sun news", "news7 tamil", "kalaignar seithigal", "etv bharat", "dd india",
    "dd news", "dd tamil", "news on air", "all india radio", "abp nadu", "times now tamil", "asianet news tamil"]),
  ...K("agency", ["pti", "press trust of india", "ani news", "ani", "ians", "uni"]),
  ...K("government", ["pib", "pwd chennai", "chennai flood monitoring (wrd)", "greater chennai corporation", "imd", "tn dipr"])
]);
const host = (d: unknown) => String(d ?? "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/**
 * A listed site's kind for a web address: the site itself, or a site it is a subdomain of (27 Nov 2026: "tamil.timesnownews.com" is Times
 * Now's, "cinema.dinamalar.com" Dinamalar's). Only a listed name with a dot counts, so a bare ending ("com", "gov.in") never does.
 */
/** A listed paper's section that is not news (sportstar.thehindu.com, cinema.dinamalar.com, food.ndtv.com): not vouched for by the paper's name. */
const NOT_NEWS_SECTION = /^(sportstar|sports?|cricket|cinema|movies?|film|entertainment|tamil-cinema|temple|astro(logy)?|spiritual|bhakthi|lifestyle|food|special|travel|auto|tech|gadgets?|money|wealth|realty|brandwagon|shopping|deals|photos?|videos?|gallery|webstories|frontline|health)\./;

function listedKind(h: string): MediaKind | null {
  if (MEDIA_DOMAINS.has(h)) return MEDIA_DOMAINS.get(h)!;
  if (NOT_NEWS_SECTION.test(h)) return null;
  for (let i = h.indexOf("."); i >= 0; i = h.indexOf(".", i + 1)) {
    const up = h.slice(i + 1);
    if (up.includes(".") && MEDIA_DOMAINS.has(up)) return MEDIA_DOMAINS.get(up)!;
  }
  return null;
}

/** The kind of official outlet (newspaper, TV, agency, government), or null for anything else. */
export function mediaKind(publisher: unknown, domain?: unknown, tier?: unknown): MediaKind | null {
  if (tier === "social" || tier === "aggregator") return null;
  const h = host(domain);
  if (h) {
    const k = listedKind(h);
    if (k) return k;
    if (h.endsWith(".gov.in") && tier === "official") return "government";
    if (h.includes(".")) return null; // a known web address that is not on the list: its name does not vouch for it
  }
  return MEDIA_NAMES.get(String(publisher ?? "").toLowerCase().replace(/\s+-\s*$/, "").trim()) ?? null;
}

/** Is this outlet official record news (a newspaper, TV news channel, news agency or government source)? */
export function isNewsMedia(publisher: unknown, domain?: unknown, tier?: unknown): boolean {
  return mediaKind(publisher, domain, tier) !== null;
}
