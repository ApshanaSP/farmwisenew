import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientIp, ipLimit } from "./rate-limit";

afterEach(() => vi.unstubAllEnvs());

const h = (xff?: string, realIp?: string) => {
  const x = new Headers();
  if (xff) x.set("x-forwarded-for", xff);
  if (realIp) x.set("x-real-ip", realIp);
  return x;
};

describe("client address for rate limits (S-4)", () => {
  it("ignores X-Forwarded-For when no proxy is trusted (a client could fake a fresh address each time)", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    expect(getClientIp(h("1.2.3.4"))).toBe("direct");
    expect(getClientIp(h("5.6.7.8", "9.9.9.9"))).toBe("direct");
  });

  it("behind one proxy takes the address the proxy appended, not the client's own entry", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    expect(getClientIp(h("6.6.6.6, 203.0.113.7"))).toBe("203.0.113.7");
    expect(getClientIp(h("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("behind two proxies takes the second entry from the right", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    expect(getClientIp(h("6.6.6.6, 203.0.113.7, 10.0.0.2"))).toBe("203.0.113.7");
  });

  it("the shared bucket gets a larger allowance; a known address keeps its own", () => {
    expect(ipLimit("direct", 20)).toBe(200);
    expect(ipLimit("203.0.113.7", 20)).toBe(20);
  });

  it("limits and then reopens a bucket after its window", () => {
    vi.useFakeTimers();
    const key = `t:${Math.random()}`;
    expect(checkRateLimit(key, 2, 1).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 1).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 1).allowed).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(checkRateLimit(key, 2, 1).allowed).toBe(true);
    vi.useRealTimers();
  });
});
