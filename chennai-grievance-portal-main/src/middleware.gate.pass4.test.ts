// QA4 gate fix: redteam-final-15. The cross-site wall takes its own host from X-Forwarded-Host only behind a proxy the server trusts.
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { crossSite } from "./middleware";

const post = (headers: Record<string, string>) => new NextRequest("http://127.0.0.1:3000/api/x", { method: "POST", headers });

describe("crossSite and X-Forwarded-Host", () => {
  afterEach(() => { delete process.env.TRUST_PROXY_HOPS; });
  it("redteam-final-15: another site's Origin is refused even when the request names that site in X-Forwarded-Host", () => {
    expect(crossSite(post({ origin: "http://evil.example", "x-forwarded-host": "evil.example", host: "127.0.0.1:3000" }))).toBe(true);
  });
  it("the site's own Origin is let through, with or without the header", () => {
    expect(crossSite(post({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(false);
    expect(crossSite(post({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000" }))).toBe(false);
  });
  it("behind a trusted proxy (TRUST_PROXY_HOPS) the forwarded host is the site's own name, as before", () => {
    process.env.TRUST_PROXY_HOPS = "1";
    expect(crossSite(post({ origin: "https://diq.example.org", host: "internal:8080", "x-forwarded-host": "diq.example.org" }))).toBe(false);
    expect(crossSite(post({ origin: "https://evil.example", host: "internal:8080", "x-forwarded-host": "diq.example.org" }))).toBe(true);
  });
});
