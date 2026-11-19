/**
 * Jarvis v6, Phase 4: "it reads the news and the web". Server only. See each file:
 *   domains.ts  the owner's allow/deny list (config/jarvis-web-domains.json)
 *   fetch.ts    the one safe way to fetch (allow-list, robots.txt, SSRF checks per hop, a pinned connection, caps, memory caches)
 *   read.ts     readArticle: one article's main text (Readability on linkedom)
 *   related.ts  relatedCoverage: other outlets' reports, from their own feeds, matched locally
 *   compare.ts  compareCoverage: facts with their outlet (verbatim quotes), agreement, difference, newest
 *   brief.ts    briefFromCoverage: 2-4 spoken sentences, English and Tamil, each fact with its outlet; the first line
 *   lookup.ts   webLookup: public questions from a fixed list of sources (SACHET for the Met department, Wikipedia, outlet feeds)
 *   serve.ts    the NDJSON events the news routes stream
 */
export { CAPS, CACHE_MS, clearWebCache, type WebDeps, type WebStatus } from "./fetch";
export { DEFAULT_DOMAINS, loadDomains, hostVerdict, type DomainList, type Outlet } from "./domains";
export { readArticle, type ArticleRead } from "./read";
export { relatedCoverage, type Coverage, type NewsItemInput, type Related } from "./related";
export { compareCoverage, type Comparison, type Fact } from "./compare";
export { briefFromCoverage, firstLine, relativeTime, type SpokenBrief } from "./brief";
export { webLookup, type LookupAnswer } from "./lookup";
export { NewsBody, ndjson, newsEvents, type NewsEvent } from "./serve";
