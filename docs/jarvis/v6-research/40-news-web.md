# 40 · News and web reading for Jarvis v6

Research date: 17 Nov 2026. Scope: read a news article on the server, find other outlets' coverage of the same event from free no-account sources, compare, and speak each fact with its outlet. Also look up public pages (e.g. the Met department) for questions the console cannot answer.

Rules used here: every figure has its URL beside it. "Probe" means a GET I made on 17 Nov 2026 from the Windows dev box (Node v24.21.0). "Inferred" marks my reading, not a source.

## Short answer

| Need | Use | Licence / terms | Status |
|---|---|---|---|
| Main text | `@mozilla/readability` 0.6.0 on `linkedom` 0.18.x | Apache-2.0 / ISC | Already in `package.json` and used by `src/lib/collector/fulltext.ts`. Measured 11.9-122.5 ms per page here. |
| Related coverage, local outlets | The outlets' own RSS feeds and news sitemaps (The Hindu, TOI, DT Next, NIE, Dinamani, Dinamalar, Dina Thanthi) | Public feeds; each robots.txt read | All 7 answered 200 in under 1 s (probe). |
| Related coverage, wider web | GDELT DOC 2.0 API | Free, unrestricted use with citation + link | Works but slow (11.7-16.4 s) and 4 of 6 probe calls got HTTP 429. Background only. |
| Met department | NDMA SACHET CAP RSS (carries IMD Chennai warnings) | Feed states public domain | 200 in 0.73 s; 26 of 98 items were from IMD Chennai (probe). |
| Background facts | Wikipedia REST (search + page summary) | CC BY-SA 4.0; descriptive User-Agent required | 200 in about 0.61 s (probe). |
| Not allowed | Google News RSS search | robots.txt disallows `/rss`; Google ToS bars automated access against robots.txt | Blocker for this source. |
| Not available | Bing Search API, DuckDuckGo results API | Bing retired 11 Aug 2025; DDG has only an Instant Answer API | No free no-account web search API found. |
| Fetch safety | Reuse `src/lib/netsafe.ts` `safeFetch` with `fetchImpl: pinnedFetch` from `src/lib/studio/fetchurl.ts` | n/a | Repo code already blocks private IPs and pins DNS; `fulltext.ts` does not pass the pinned fetch today. |

## 1. Main-text extraction in Node

### Mozilla Readability

- Licence: Apache License 2.0. Source: https://raw.githubusercontent.com/mozilla/readability/main/LICENSE.md ; npm lists `Apache-2.0` for 0.6.0 (https://registry.npmjs.org/@mozilla%2Freadability/latest).
- Node has no DOM, so the README says to bring one (its example is jsdom), pass `document`, and set the page URL so relative links resolve. Source: https://raw.githubusercontent.com/mozilla/readability/main/README.md
- `parse()` returns title, HTML content, plain `textContent`, length, excerpt, byline, dir, siteName, lang, publishedTime. Options include `charThreshold` (default 500) and `maxElemsToParse` (default 0 = no limit). `isProbablyReaderable` is a quick pre-check (defaults `minContentLength` 140, `minScore` 20). Same README.
- Readability does not sanitise. The README recommends DOMPurify plus CSP if the HTML is shown. Same README. For speech we only use `textContent`, so no HTML is rendered (inferred).
- Size: 154,574 bytes unpacked, no dependencies, Node >= 14 (npm registry URL above).

### Measured here (Readability on linkedom, 20 runs each, this box)

Script ran from the scratchpad against the repo's own `node_modules`. Pages fetched once from links in the outlets' feeds.

| Page | HTML size | Readerable | Text chars | ms min / median / max | Notes |
|---|---|---|---|---|---|
| The Hindu Chennai article | 237,730 chars | true | 2,720 | 11.9 / 19.5 / 54.8 | Byline, publishedTime, siteName found. Text starts with a photo caption. |
| Dinamani (Tamil) | 456,634 chars | true | 1,453 | 30.7 / 46.1 / 91.3 | Clean Tamil body. |
| Dinamalar (Tamil) | 318,885 chars | true | 2,419 | 41.0 / 58.5 / 122.5 | Breadcrumb and "ADDED" date lines leak into the text; needs a small clean-up step. |

Verdict: works here, fast enough for a voice turn, already a dependency. Use it.

### DOM implementations

| Library | Licence | Unpacked size | Deps | Node | Notes |
|---|---|---|---|---|---|
| linkedom 0.18.15 | ISC | 1,190,822 B | 5 (htmlparser2, css-select, ...) | >= 16 | README: prefers minimal/fast over full standard compliance; says it is not as slow or bloated as JSDOM; points to JSDOM when full compliance is needed. https://raw.githubusercontent.com/WebReflection/linkedom/main/README.md |
| jsdom 31.0.1 | MIT | 6,910,759 B | 18 | ^22.22.2, ^24.15.0, >= 26 | Readability's README example. Heavier. |
| happy-dom 21.0.4 | MIT | 9,185,190 B | 7 | >= 20 | README makes no speed claim vs jsdom. https://raw.githubusercontent.com/capricorn86/happy-dom/master/README.md |

Sizes, deps and engines: https://registry.npmjs.org/<name>/latest (read 17 Nov 2026). The project pins `"node": "22.x"` in `package.json`.

No published head-to-head speed numbers were read. Only linkedom was timed here.

### Alternatives

- `@extractus/article-extractor` 9.0.1: MIT. Its npm dependencies are `linkedom` and `@mozilla/readability`, so it wraps the same pair (https://registry.npmjs.org/@extractus%2Farticle-extractor/latest). README: `extract(url|html)` and `extractFromHtml(html, url)`; output has title, author, published, content, source, ttr; default fetcher is `globalThis.fetch`, replaceable (https://raw.githubusercontent.com/extractus/article-extractor/main/README.md). Risk: calling `extract(url)` would fetch outside our SSRF guard. If used, call only `extractFromHtml` (inferred).
- `defuddle` 0.19.6: MIT, 2,765,043 B unpacked (npm). README: accepts a Document from JSDOM, linkedom or happy-dom; more forgiving than Readability, removes fewer uncertain elements, reads schema.org data; calls itself a work in progress (https://raw.githubusercontent.com/kepano/defuddle/main/README.md). Worth a later A/B on Dinamalar boilerplate. Not tested here.
- DOMPurify 3.4.18: `(MPL-2.0 OR Apache-2.0)`; can be taken under Apache-2.0 (npm). Needed only if extracted HTML is shown in the console.

## 2. Free, no-account sources for related coverage

### 2a. The outlets' own feeds (best fit, inferred)

These are what `chennai_news_pipeline/config.yaml` already lists. Matching a story locally against these feeds sends no query text to any third party, so nothing about the incident leaves the server (inferred).

Probe results (17 Nov 2026, one GET each, plain UA):

| Outlet | Feed | HTTP / time / size | Items | robots.txt (for `*`) |
|---|---|---|---|---|
| The Hindu | https://www.thehindu.com/news/cities/chennai/feeder/default.rss | 200 / 0.22 s / 43,832 B | 61 | The probed article path matched no Disallow rule (my reading); news sitemap listed |
| Times of India | https://timesofindia.indiatimes.com/rssfeeds/2950623.cms | 200 / 0.37 s / 20,738 B | 21 | `Allow: /`; disallows `/*rssarticleshow*` |
| DT Next | https://www.dtnext.in/api/v1/collections/newschennai-news.rss | 200 / 0.67 s / 508,836 B | 40 | Feed itself listed as a Sitemap |
| New Indian Express | https://www.newindianexpress.com/cities/chennai/rssfeed/?id=182&getXmlFeed=true | 200 / 0.91 s / 164,073 B | 40 | `Allow: /`. Redirects to `/api/v1/collections/chennai-cities.rss` |
| Dinamani (Tamil) | https://www.dinamani.com/stories.rss | 200 / 0.26 s / 117,066 B | 18 | Disallows `/story/` |
| Dinamalar (Tamil) | https://www.dinamalar.com/sitemap_latest.xml (no RSS) | 200 / 0.20 s / 67,149 B | 101 URLs | Disallows `/search`, `/show.asp` |
| Dina Thanthi (Tamil) | https://www.dailythanthi.com/api/v1/collections/tamilnadu-news.rss | 200 / 0.46 s / 261,573 B | not counted | `Allow: /api/v1/collections/`; feed listed as a Sitemap |

robots.txt files: `https://<host>/robots.txt` for each host above. Each publisher's own feed terms were not read (see Not verified).

### 2b. GDELT DOC 2.0 API

- Endpoint: `https://api.gdeltproject.org/api/v2/doc/doc`. Searches a rolling last 3 months. Source: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- Query syntax (same source): phrases in double quotes; `(a OR b)` (no nesting); `-` to exclude; `domain:`, `domainis:`; `sourcecountry:` takes a country name without spaces or a 2-letter FIPS code; `sourcelang:` takes a name or 3-letter code, covering 65 machine-translated languages; `near20:"a b"`, `repeat3:"word"`, `theme:`, `tone>5`.
- Parameters (same source): `mode=ArtList` (others: timelines, tone chart, image modes); `format=json|rss|csv|jsonfeed|html`; `timespan` in min/h/d/w/m with a 15-minute minimum; `startdatetime`/`enddatetime` as YYYYMMDDHHMMSS; `maxrecords` default 75, max 250; `sort=DateDesc|DateAsc|ToneDesc|ToneAsc|HybridRel`. CORS is `*`.
- Terms: datasets are free for unlimited academic, commercial or government use; redistribution allowed; any use must cite the GDELT Project and link https://www.gdeltproject.org/. Source: https://www.gdeltproject.org/about.html . The terms do not mention the API separately.
- Rate limit: not on the blog page. The server's 429 body says to send at most one request every 5 seconds and points heavy users to the ngrams dataset (probe).
- Freshness: GDELT 2.0 files update every 15 minutes per GDELT's blog (search result https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/ , not opened). I found no official DOC-API latency figure.
- Probe (6 calls, spaced well over 5 s apart by tool sequence, not timed exactly):
  - `Chennai flood sourcecountry:india`, 7d: 200, body `{}` (no articles), 16.4 s.
  - `chennai sourcecountry:IN`, 2d, 15 records: one 429 (13.2 s), then 200 with 10 articles in 14.8 s. Fields: `url, url_mobile, title, seendate, socialimage, domain, language, sourcecountry`. Languages seen: Bengali, Hindi, English. Newest `seendate` was 20261116T081500Z while the probe ran at about 06:08 UTC on 17 Nov, so about 22 h old (inferred: lag or sparse match).
  - `chennai sourcelang:tamil` and a `domain:` OR-list of the seven Tamil Nadu outlets: three 429s (11.7-13.2 s). Tamil-outlet coverage is therefore not verified.
- Verdict: allowed (free, no key, permissive terms with citation). Too slow and too throttled for the live voice turn. Use only as a background, cached, one-call-per-incident lookup, and say "GDELT" in attribution (inferred).

### 2c. Google News RSS search — not allowed

- `https://news.google.com/robots.txt` (probe): for `User-agent: *` it is `Disallow: /` with Allows only for `/`, `/home`, `/topics/`, `/publications/`, `/stories/`, `/swg/`, `/about`. `/rss` is not allowed. It also fully disallows ClaudeBot, GPTBot, CCBot and others.
- Google Terms of Service (effective 30 July 2026) list, under abuse, automated access to Google content in violation of machine-readable instructions such as robots.txt. Source: https://policies.google.com/terms?hl=en-US
- The older Google News terms page (last updated 17 Jan 2006) limits use to personal, non-commercial display and bars robots and spiders. It may be superseded. Source: https://www.google.com/intl/en_us/terms_google_news.html
- Item links are opaque `https://news.google.com/rss/articles/CBMi...` IDs (seen in this repo's stored pipeline data). Community sources say resolving them needs an undocumented `batchexecute` call per link (https://hexdocs.pm/google_news_decoder/GoogleNewsDecoder.html , https://gist.github.com/huksley/bc3cb046157a99cd9d1517b32f91a99e ; not opened, search summaries only). That path is also under the robots.txt disallow.
- `src/lib/collector/fulltext.ts` already refuses to follow Google News links for this reason. But `chennai_news_pipeline/config.yaml` still has `google_news: enabled: true` (owner decision; not changed).
- Verdict: do not use for v6.

### 2d. Wikipedia / Wikimedia

- Search: `GET https://en.wikipedia.org/w/rest.php/v1/search/page?q=...&limit=n` (limit 1-100, default 50); fields `id, key, title, excerpt, matched_title, description, thumbnail`. Title prefix: `/search/title`. Page: `/page/{title}/bare`, `/with_html`, `/html`. Source: https://www.mediawiki.org/wiki/API:REST_API/Reference
- Summary: `GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}` (probe: 200, 0.61 s, 3,192 B; fields include `title, description, extract, content_urls, timestamp, wikibase_item`; `cache-control: s-maxage=1209600, max-age=300`). Not listed on the REST reference page above.
- Search probe: `q=Chennai flood&limit=3` → 200, 0.61 s; top hits 2015_South_India_floods, Cyclone_Michaung, 2005_Chennai_floods.
- User-Agent policy: format `client/version (contact) library/version`; contact may be an email or website; automated clients should include "bot"; generic UAs (curl, python-requests) may be blocked; copying a browser UA for a bot is prohibited. Source: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy . Note: `fulltext.ts` uses a browser-like UA; Wikipedia calls need a separate, non-browser UA (inferred).
- Rate limits (new in 2026, may change): unidentified 10 req/min; unauthenticated bots with a compliant UA 200 req/min; on excess HTTP 429 with Retry-After, else wait at least 5 s. Source: https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits . Etiquette: prefer serial requests, send `Accept-Encoding: gzip`. Source: https://www.mediawiki.org/wiki/API:Etiquette
- Licence: text is CC BY-SA (4.0 for modifications) and, unless noted, GFDL; reuse needs a link to the page (or author list) and a licence notice. Source: https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content . For a spoken answer: say "according to Wikipedia" and show the page link and "CC BY-SA 4.0" on screen (inferred).
- robots.txt for `*` disallows `/w/` and `/api/` (probe of https://en.wikipedia.org/robots.txt). The API pages above set limits for bots on these same APIs, so on-demand API calls look sanctioned; robots.txt targets crawlers (inferred, see Not verified).
- Tamil Wikipedia (`ta.wikipedia.org`) should expose the same endpoints (inferred, not probed).

### 2e. Met department (IMD) and alerts

- NDMA SACHET CAP RSS: `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml`. Probe: 200, 0.73 s, 60,907 B, 98 items, `<copyright>public domain</copyright>`. 26 items authored "IMD Chennai"; newest Chennai item 16 Nov 2026 01:20 GMT, naming Chennai, Chengalpattu, Thiruvallur and others. District names are sometimes abbreviated ("Cpattu", "Kanche"), so an alias table is needed (inferred). Each item links a CAP XML via `FetchXMLFile?identifier=...`. robots.txt is 404, which RFC 9309 treats as "may access". Feed URL found via a forum thread in search results (https://community.windy.com/topic/43097/weather-warning-problem/16); SACHET's RSS offering is described at https://en.vikaspedia.in/social-welfare/disaster-management-1/national-disaster-alert-portal .
- IMD district warnings API `https://mausam.imd.gov.in/api/warnings_district_api.php?id=78`: 401 (probe). The repo's `imd_weather_collector/imd_weather_collector.py` notes it is IP-whitelisted and falls back to IMD's GIS WFS. Not usable from the console.
- IMD CAP feed on S3 `https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml`: 200, 1 item dated 27 Sep 2026 (probe). Stale; do not rely on it.
- Verdict: SACHET is the free, no-key, public-domain source for "what did the Met department say". Cache it (poll every few minutes) rather than fetch per question (inferred).

### 2f. Web search APIs — none free and no-account

- Bing Search APIs retired on 11 Aug 2025 and were fully decommissioned; Microsoft points to paid Grounding with Bing in Azure AI Agents. Source: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- DuckDuckGo: only an Instant Answer API. Probe of `https://api.duckduckgo.com/?q=Chennai+flood+news&format=json`: 200, 0.18 s, empty abstract, 0 results, 0 related topics. Scraping its HTML pages is not an API (search summaries: https://apiserpent.com/blog/free-duckduckgo-api , https://docs.searxng.org/dev/engines/online/duckduckgo.html).
- Conclusion: there is no free, no-account general web search here. "Look up public pages" must mean a fixed allow-list of known sources (outlet feeds, SACHET, Wikipedia, GDELT, government sites), not open web search (inferred).

## 3. Safe fetching on the server

### OWASP SSRF cheat sheet

Source: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

- Prefer allow-lists; deny-lists are bypass-prone. Build the request yourself from a matched host instead of trusting a full URL.
- Schemes: http and https only.
- Resolve, check every address, then make the client connect only to the checked address. A second unchecked lookup defeats the check (DNS rebinding). Keep the original host name for Host, SNI and certificate checks.
- Disable automatic redirects; check each hop.
- Canonicalise IPv6 forms (mapped, NAT64) to IPv4 before checking.
- Ranges named: 169.254.169.254, fd00:ec2::254, metadata.google.internal; 127.0.0.0/8, 0.0.0.0/8, ::1/128; 10/8, 172.16/12, 192.168/16; 169.254.0.0/16; fc00::/7, fe80::/10; 224.0.0.0/4, ff00::/8; ::ffff:0:0/96; 64:ff9b::/96, 64:ff9b:1::/48.
- Add network-layer egress rules too.

### What the repo already has (read, not changed)

- `src/lib/netsafe.ts`: http(s) only, no userinfo; every DNS answer must be public (private, loopback, link-local, CGNAT, multicast, reserved, IPv4-in-IPv6 incl. NAT64); redirects followed by hand with each hop checked (default `maxHops` 6); Authorization/Cookie dropped on cross-origin hops; default timeout 20 s, default `maxBytes` 6,000,000. Its header comment says DNS rebinding is not covered unless the connection is pinned.
- `src/lib/studio/fetchurl.ts`: `pinnedFetch` connects only to an address the policy returned (custom `lookup` on `http(s).request`), closing the rebinding gap.
- `src/lib/collector/fulltext.ts` calls `safeFetch` with 12 s and 8,000,000 bytes but without `fetchImpl: pinnedFetch` (from the first 60 lines). For v6, pass the pinned fetch (inferred).
- Two robots.txt parsers exist (`fulltext.ts` and `src/lib/studio/connect/robots.ts`). The Studio one treats 401/403 as "keep out", which is stricter than RFC 9309 (4xx = may access). Stricter is safe.

### undici (if new code is written instead)

- `connect` takes `buildConnector` options (all `tls.connect` options) or a custom connector; docs show a custom `lookup` example; connect `timeout` default 10 s; `headersTimeout` and `bodyTimeout` default 300 s; `maxResponseSize` default -1 (off). Source: https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Client.md
- Interceptors: `redirect({ maxRedirections, throwOnMaxRedirect, stripHeadersOnCrossOriginRedirect })` (0 disables following); `dns({ lookup, pick, maxTTL, dualStack, affinity })` accepts a custom lookup; `decompress({ maxSize })` default 0 = no limit. Source: https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Interceptors.md
- So: an `Agent` with `connect.lookup` that resolves, filters private addresses and returns only public ones gives connect-time pinning; set `maxRedirections: 0` and follow by hand; set `headersTimeout`, `bodyTimeout`, `maxResponseSize` and a decompress `maxSize` explicitly, since the defaults are open (inferred from the defaults above).
- undici 8.12.4 (repo pin) needs Node >= 22.19.0 (npm). MIT.

### Suggested caps (inferred; evidence beside each)

| Cap | Value | Why |
|---|---|---|
| Redirects | 5 | RFC 9309 asks robots fetchers to follow at least five; undici's own example uses 5; repo default is 6. |
| Article HTML | 2 MB | Largest page probed was 503,017 B (Dinamani); largest feed 508,836 B (DT Next). Repo uses 6-8 MB. |
| robots.txt | 500 KiB parse limit | RFC 9309 says the limit must be at least 500 KiB. |
| Per fetch, voice path | 8 s total; connect 3 s | Feeds and articles answered in 0.18-0.91 s; GDELT took 11.7-16.4 s, so GDELT stays off the voice path. |
| Decompressed size | same as body cap | undici decompress has no limit by default. |
| Content types | text/html, application/xhtml+xml, RSS/Atom/XML, JSON | Nothing else is parsed. |

### robots.txt

- RFC 9309 (https://www.rfc-editor.org/rfc/rfc9309.html): case-insensitive product-token match, else `*` group; most specific (longest) match wins, Allow wins ties; `*` and `$` special; 2xx follow rules; follow at least five redirects; 4xx "unavailable" = may access; 5xx or network error "unreachable" = assume complete disallow; cache at most 24 h unless unreachable; parse limit at least 500 KiB; robots.txt is not access control.
- `robots-parser` 3.0.1: MIT, 46,257 B, no dependencies, Node >= 10 (npm). Supports `*` and `$`; aims for RFC 9309; API `isAllowed`, `isDisallowed`, `getCrawlDelay`, `getSitemaps`; you pass it the file text. Source: https://raw.githubusercontent.com/samclarke/robots-parser/master/README.md . Optional, since the repo has its own parser.

## 4. Prompt-injection defence for a page-reading agent

### Primary sources

- Spotlighting (Hines et al., Microsoft, arXiv 2403.14720, Mar 2024): transform untrusted input so the model always knows where it came from. Three modes: delimiting (tags; easy to bypass, not recommended), datamarking (replace whitespace with a marker token), encoding (base64; best results but only for strong models). Abstract: attack success fell from above 50% to below 2% on GPT-family models. Body: datamarking on GPT-3.5-Turbo summarisation took ASR from about 50% to 3.10%; encoding 0.0% (summarisation) and 1.8% (Q&A); datamarking may not suit code; use randomised markers. Sources: https://arxiv.org/abs/2403.14720 , https://arxiv.org/html/2403.14720
- Design Patterns for Securing LLM Agents against Prompt Injections (Beurer-Kellner et al., IBM, Invariant Labs, ETH Zurich, Google, Microsoft and others; arXiv 2506.08837, June 2025): principle is that once an agent has read untrusted input, that input must be unable to trigger consequential actions. Six patterns: Action-Selector, Plan-Then-Execute, LLM Map-Reduce, Dual LLM, Code-Then-Execute, Context-Minimization. Sources: https://arxiv.org/abs/2506.08837 , https://arxiv.org/html/2506.08837
- CaMeL (Debenedetti et al., Google, Google DeepMind, ETH Zurich; arXiv 2503.18813): a privileged LLM sees only the user's query and writes the plan; a quarantined LLM parses untrusted data into a schema and has no tools; capabilities track where each value came from and block policy-breaking tool calls. AgentDojo: 77% of tasks solved with provable security vs 84% undefended. Sources: https://arxiv.org/abs/2503.18813 , https://arxiv.org/html/2503.18813
- OWASP LLM01:2025 Prompt Injection: indirect injection comes from external sources such as websites. Mitigations: constrain model behaviour; define and validate output formats; input and output filtering; least privilege; human approval for high-risk actions; segregate and identify external content; adversarial testing. Source: https://genai.owasp.org/llmrisk/llm01-prompt-injection/

### Practical rules for Jarvis v6 (derived from the above; inferred)

1. Fetched text is data only. It goes in its own message block, never the system prompt, wrapped and datamarked with a per-request random marker (spotlighting).
2. The call that reads page text has no tools (Dual LLM / quarantined LLM). It only returns a fixed JSON schema: `{claims: [{text, quote, outlet, url, published}]}`. Validate the schema; drop anything else.
3. Plan before reading (Plan-Then-Execute). Which sources to fetch is decided from the Collector's question and the incident record, from a fixed allow-list. URLs found inside article text are never fetched.
4. One extraction call per article, then a separate compare step over the extracted claims only (LLM Map-Reduce, Context-Minimization).
5. No action that changes state can follow from web text. Anything consequential needs the Collector's spoken or clicked yes (OWASP item 5).
6. Queries carry only event words: place, incident type, date. Never a complainant's name, phone, address, or complaint ID. GDELT and Wikipedia queries are GET URLs that the provider can log (inferred).
7. Speak attribution per fact: "The Hindu reports ...; Dinamani says ...". Where outlets disagree, say so and name both.

### Claim-level citations

- ALCE (Gao, Yen, Yu, Chen; arXiv 2305.14627): benchmark for LLM answers with citations, scored on fluency, correctness and citation quality; on ELI5 even the best models lacked complete citation support 50% of the time. Source: https://arxiv.org/abs/2305.14627
- Anthropic's research system (13 Jun 2025) runs a separate CitationAgent after research to place citations so claims are attributed; its judge also checked primary over secondary sources, after early agents preferred SEO content farms. Source: https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic's Citations API returns `cited_text` pointing into the supplied documents, guaranteed to be valid pointers, and `cited_text` does not count toward output tokens. Source: https://platform.claude.com/docs/en/build-with-claude/citations . It is Claude-only; v6 runs on Groq per the v5 notes, so do the same check in code (inferred).
- Rule for v6 (inferred): every claim carries a `quote` that must be found verbatim (after whitespace normalisation) in that outlet's extracted text. A claim whose quote is not found is dropped before speech. Show outlet, headline, time and link on screen for each spoken fact.

## Cost and fit

All sources above are free and need no account. Compute: Readability on linkedom took 11.9-122.5 ms per page here (three pages, 20 runs each). The only slow source is GDELT (11.7-16.4 s, frequent 429s). Everything runs on the Node server and on the Windows dev box (all probes and the timing run were on it).

## Not verified

- GDELT coverage of Tamil-language and Tamil Nadu outlets (both probes for it got 429). DOC-API indexing delay (one probe's newest hit was about 22 h old).
- GDELT's real rate limit: 4 of 6 calls got 429 despite more than 5 s spacing; whether the limit is per IP, shared, or load-based is unknown.
- Whether GDELT's terms of use cover the DOC API, not only the datasets.
- Each newspaper's RSS terms (personal vs commercial use) and whether reading and summarising their articles for a government console is fair dealing under Indian law. Not researched.
- Whether Wikimedia regards on-demand REST calls as covered by the API rate-limit policy rather than robots.txt's `/api/` disallow (my reading, not stated by Wikimedia).
- The Wikipedia `/api/rest_v1/page/summary` endpoint's long-term status (it is not on the MediaWiki REST reference page).
- SACHET feed's official documentation page and update cadence; the URL came from a forum thread and worked on 17 Nov 2026.
- Readability on happy-dom or jsdom (only linkedom was run). Any published speed comparison of the three DOMs.
- defuddle and article-extractor quality on Tamil pages (not run).
- Spotlighting/datamarking effect on Groq-hosted models and on Tamil text (the paper tested GPT-family models on English).
- Node's `net` calling a custom `lookup` with `all: true` (Happy Eyeballs) and how a filtering lookup must answer in that case.
- Times of India article extraction (no article link was picked up from its feed in the probe).
