/**
 * The morning check (masterclass 9.12): real public links, read-only, through the link engine, each with the outcome
 * it should end in. Runs only with STUDIO_LIVE=1 (it uses the internet, at one request a second per site, within each
 * site's robots.txt):  STUDIO_LIVE=1 npx vitest run src/lib/studio/morning.live.test.ts
 * The outcomes are written to the scratch JSON named in STUDIO_LIVE_OUT for the report.
 */
import fs from "fs";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.STUDIO_DIR = `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/studio-morning-${process.pid}`;
  process.env.STUDIO_BROWSER = "0";
});
import { resolveLink } from "@/lib/studio/connect/resolve";

const LINKS: { what: string; url: string; expect: string[] }[] = [
  { what: "data.opencity.in CKAN dataset (public toilets)", url: "https://data.opencity.in/dataset/chennai-public-toilets", expect: ["data", "choose"] },
  { what: "data.opencity.in dataset (fire stations)", url: "https://data.opencity.in/dataset/chennai-fire-stations", expect: ["data", "choose"] },
  { what: "tn.data.gov.in resource page (no key)", url: "https://tn.data.gov.in/resource/list-districts-tamil-nadu-code", expect: ["blocked"] },
  { what: "Wikipedia: list of neighbourhoods of Chennai", url: "https://en.wikipedia.org/wiki/List_of_neighbourhoods_of_Chennai", expect: ["data", "choose"] },
  { what: "Chennai news section (The Hindu)", url: "https://www.thehindu.com/news/cities/chennai/", expect: ["nodata", "blocked"] },
  { what: "A random Wikipedia article", url: "https://en.wikipedia.org/wiki/Haiku", expect: ["nodata", "notrelevant"] },
  { what: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expect: ["nodata"] },
  { what: "GitHub CSV (world GDP)", url: "https://github.com/plotly/datasets/blob/master/2014_world_gdp_with_codes.csv", expect: ["notrelevant"] },
  { what: "chennai.nic.in home page", url: "https://chennai.nic.in/", expect: ["nodata", "choose", "data", "blocked"] },
  { what: "A missing page on chennai.nic.in", url: "https://chennai.nic.in/this-page-does-not-exist-studio-check/", expect: ["error", "nodata"] },
  { what: "Tableau Public", url: "https://public.tableau.com/app/profile/x/viz/y/z", expect: ["blocked"] },
  { what: "Loopback (SSRF)", url: "http://127.0.0.1:3001/", expect: ["error"] }
];

describe.runIf(process.env.STUDIO_LIVE === "1")("9.12 the morning check (live)", () => {
  const out: { what: string; url: string; outcome: string; reason: string; why: string; ms: number }[] = [];
  for (const l of LINKS) {
    it(l.what, async () => {
      const t0 = Date.now();
      const r = await resolveLink(l.url, { mode: "none" }, { log: () => {} });
      out.push({ what: l.what, url: l.url, outcome: r.outcome.kind, reason: r.outcome.reason, why: r.outcome.why.slice(0, 200), ms: Date.now() - t0 });
      if (process.env.STUDIO_LIVE_OUT) fs.writeFileSync(process.env.STUDIO_LIVE_OUT, JSON.stringify(out, null, 1));
      expect(l.expect).toContain(r.outcome.kind);
    }, 120_000);
  }
});
