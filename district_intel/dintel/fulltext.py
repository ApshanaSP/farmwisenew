"""Full text for news we only have as a Google News headline.

Google News article links are never followed: news.google.com's robots.txt disallows them (and the API that decodes
them) for every crawler. Instead the headline is looked up in the publisher's own news sitemap, which the publisher
lists in its robots.txt for exactly this purpose, and the article page is downloaded from the publisher's site when
its robots.txt allows our user agent. trafilatura takes the article text out of the page.

Everything is cached in output/state/news_fulltext.jsonl, so an article is downloaded once. Each run has a cap and a
time budget, newest articles first; a headline not yet in the sitemap is tried again on later runs while it is fresh.
The news pipeline itself is not changed: this only adds text to the documents the build reads from it.
"""
from __future__ import annotations

import json
import re
import threading
import time
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import pandas as pd
import requests
import yaml

from .util import log

VERSION = "ft-v1"
FOUND, NOT_FOUND, BLOCKED, EMPTY = "full", "not_in_sitemap", "robots_disallowed", "no_text"
_NS = re.compile(r"\{[^}]*\}")
_NEWS_TITLE = "{http://www.google.com/schemas/sitemap-news/0.9}title"


def norm_title(t: str) -> str:
    """Headline key: lower case, letters and digits only (Tamil vowel signs kept), publisher suffix removed."""
    t = unicodedata.normalize("NFC", str(t or "")).lower()
    t = re.sub(r"\s+[-|–]\s+[^-|–]{2,40}$", "", t)  # " - Dinakaran" on Google News titles
    return re.sub(r"[^\w஀-௿]+", " ", t).strip()


def _similar(a: str, b: str) -> float:
    """Share of the shorter headline's words found in the other: Google News titles often add keywords
    ("chennai crime ...") to the publisher's own headline. Four shared words at least."""
    x, y = set(a.split()), set(b.split())
    common = len(x & y)
    return common / max(min(len(x), len(y)), 1) if common >= 4 else 0.0


class Site:
    """One publisher: its robots.txt, news sitemap entries (headline -> URL) and a polite request rate."""

    def __init__(self, domain: str, session: requests.Session, agent: str, timeout: float) -> None:
        self.domain, self.session, self.agent, self.timeout = domain, session, agent, timeout
        self.robots: RobotFileParser | None = None
        self.entries: dict[str, str] = {}
        self.delay = 1.0
        self.last = 0.0
        self.lock = threading.Lock()
        self.loaded = False

    def _get(self, url: str) -> requests.Response | None:
        with self.lock:
            wait = self.last + self.delay - time.time()
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
        try:
            r = self.session.get(url, timeout=self.timeout)
            return r if r.ok else None
        except requests.RequestException:
            return None

    def allowed(self, url: str) -> bool:
        return self.robots is not None and self.robots.can_fetch(self.agent, url)

    def load(self, max_sitemaps: int = 4) -> None:
        """robots.txt, then the news sitemaps it lists (a sitemap index is followed to its newest children)."""
        self.loaded = True
        for host in (f"https://www.{self.domain}", f"https://{self.domain}") if self.domain.count(".") == 1 else (f"https://{self.domain}",):
            r = self._get(f"{host}/robots.txt")
            if r is not None:
                break
        else:
            return  # no robots.txt reachable: nothing is fetched from this site
        self.robots = RobotFileParser()
        self.robots.parse(r.text.splitlines())
        self.delay = max(1.0, float(self.robots.crawl_delay(self.agent) or 0))
        maps = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", r.text)
        # news sitemaps first; a site that does not name one (Dinamalar's sitemap.xml is a news sitemap) gets its first few
        todo = [m for m in maps if "news" in m.lower()] or maps
        seen = 0
        while todo and seen < max_sitemaps:
            m = todo.pop(0)
            if not self.allowed(m):
                continue
            seen += 1
            x = self._get(m)
            if x is None:
                continue
            try:
                root = ET.fromstring(x.content)
            except ET.ParseError:
                continue
            if _NS.sub("", root.tag) == "sitemapindex":
                kids = [(s.text or "").strip() for s in root.iter() if _NS.sub("", s.tag) == "loc"]
                todo = kids[:2] + todo  # the newest first: indexes list them that way
                continue
            for u in root:
                loc = title = None
                for el in u.iter():
                    tag = _NS.sub("", el.tag)
                    if tag == "loc" and loc is None:
                        loc = (el.text or "").strip()
                    elif el.tag == _NEWS_TITLE and el.text:  # not <image:title>
                        title = el.text.strip()
                if loc and title:
                    self.entries.setdefault(norm_title(title), loc)

    def find(self, title: str) -> str | None:
        k = norm_title(title)
        if k in self.entries:
            return self.entries[k]
        best = max(((_similar(k, t), u) for t, u in self.entries.items()), default=(0.0, None))
        return best[1] if best[0] >= 0.85 else None

    def page(self, url: str) -> tuple[str, str | None]:
        """The article page's HTML (text extraction happens on the main thread: lxml crashed when run in threads)."""
        if not self.allowed(url):
            return BLOCKED, None
        r = self._get(url)
        return (FOUND, r.text) if r is not None else (EMPTY, None)


def extract(html: str, url: str, min_chars: int) -> str | None:
    import trafilatura
    try:
        text = trafilatura.extract(html, url=url, include_comments=False, include_tables=False, favor_precision=True)
    except Exception:  # trafilatura can raise on malformed HTML
        return None
    return text.strip() if text and len(text.strip()) >= min_chars else None


def _http_cfg(settings) -> tuple[str, str, float]:
    """The news pipeline's own user agent and robots token, so publishers see one consistent crawler."""
    try:
        h = yaml.safe_load(settings.src("news", "config").read_text(encoding="utf-8"))["http"]
        return h["user_agent"], h["robots_user_agent"], float(h.get("timeout_seconds", 20))
    except Exception:
        return "Mozilla/5.0 (compatible; ChennaiDistrictNewsDataset/1.0)", "ChennaiDistrictNewsDataset", 20.0


def _cache_path(settings):
    return settings.out_dir / "state" / "news_fulltext.jsonl"


def read_cache(settings) -> dict[str, dict]:
    out: dict[str, dict] = {}
    p = _cache_path(settings)
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                x = json.loads(line)
            except json.JSONDecodeError:
                continue
            if x.get("v") == VERSION:
                out[x["k"]] = x
    return out


def fetch(settings, docs: pd.DataFrame) -> dict[str, dict]:
    """Looks up and downloads full text for Google News headlines in `docs` (doc_id, title, source_domain,
    published_at, body_status). Returns the cache: doc_id -> {status, url, text}."""
    cfg = settings.raw.get("news_fulltext", {})
    cache = read_cache(settings)
    if not cfg.get("enabled", True):
        return cache
    now = pd.Timestamp.now(tz="Asia/Kolkata")
    fresh = pd.Timedelta(hours=float(cfg.get("retry_hours", 48)))
    skip = set(cfg.get("skip_domains") or [])
    want = docs[(docs["body_status"] == "snippet_google_news") & ~docs["doc_id"].isin(cache)
                & (docs["published_at"] >= now - pd.Timedelta(days=float(cfg.get("days", 3))))
                & ~docs["source_domain"].isin(skip)].sort_values("published_at", ascending=False)
    want = want.head(int(cfg.get("max_per_run", 150)))
    if not len(want):
        return cache
    try:  # antivirus / proxy TLS inspection: verify against the OS certificate store
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass
    agent_ua, agent, timeout = _http_cfg(settings)
    session = requests.Session()
    session.headers.update({"User-Agent": agent_ua, "Accept-Language": "en-IN,ta;q=0.8"})
    deadline = time.time() + 60 * float(cfg.get("minutes", 4))
    min_chars = int(cfg.get("min_chars", 200))
    by_site: dict[str, list] = defaultdict(list)
    for r in want.itertuples():
        by_site[str(r.source_domain)].append(r)
    got: list[tuple] = []
    sites_ok: set[str] = set()
    lock = threading.Lock()

    def one_site(domain: str) -> None:
        site = Site(domain, session, agent, timeout)
        site.load()
        if site.entries:
            sites_ok.add(domain)
        for r in by_site[domain]:
            if time.time() >= deadline:
                return
            url = site.find(r.title) if site.entries else None
            status, html = (NOT_FOUND, None) if url is None else site.page(url)
            with lock:
                got.append((r, url, status, html))

    with ThreadPoolExecutor(max_workers=int(cfg.get("workers", 6))) as pool:
        list(pool.map(one_site, list(by_site)))
    rows: list[dict] = []
    counts: Counter = Counter()
    for r, url, status, html in got:
        text = extract(html, url, min_chars) if html else None
        if status == FOUND and not text:
            status = EMPTY
        counts[status] += 1
        # a headline missing from today's sitemap may appear later: only a settled answer is cached
        if status == NOT_FOUND and now - r.published_at < fresh:
            continue
        rows.append({"k": r.doc_id, "v": VERSION, "at": time.time(), "status": status, "url": url,
                     "text": text[:12000] if text else None})
    if rows:
        p = _cache_path(settings)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as f:
            for x in rows:
                f.write(json.dumps(x, ensure_ascii=False) + "\n")
        cache.update({x["k"]: x for x in rows})
    log.info("news full text: %d Google News headlines tried on %d publisher sites (%d sites with a readable news sitemap): %s",
             len(want), len(by_site), len(sites_ok), dict(counts))
    return cache
