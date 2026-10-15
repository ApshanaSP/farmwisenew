import { describe, expect, it } from "vitest";
import { jsonWithEtag } from "./etag";

const req = (tag?: string) => new Request("http://x/api", { headers: tag ? { "if-none-match": tag } : {} });

describe("jsonWithEtag", () => {
  it("sends the body with an ETag the first time", async () => {
    const res = jsonWithEtag(req(), { a: 1 }, { "Cache-Control": "private, no-cache" });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^".+"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("answers 304 with no body when the browser already has the same data", async () => {
    const tag = jsonWithEtag(req(), { a: 1 }).headers.get("etag")!;
    const res = jsonWithEtag(req(`W/${tag}`), { a: 1 });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("sends the new body once the data changes", () => {
    const tag = jsonWithEtag(req(), { a: 1 }).headers.get("etag")!;
    expect(jsonWithEtag(req(tag), { a: 2 }).status).toBe(200);
  });
});
