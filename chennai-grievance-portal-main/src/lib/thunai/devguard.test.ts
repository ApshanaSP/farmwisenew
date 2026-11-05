import { describe, expect, it } from "vitest";
import { localOnly } from "./devguard";

const h = (o: Record<string, string | undefined>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
describe("the dev Jarvis routes answer this machine only (OPEN-2)", () => {
  it.each([{ host: "localhost:3000" }, { host: "127.0.0.1:3021" }, { host: "[::1]:3000" }])("local %o", (x) => expect(localOnly(h(x))).toBe(true));
  it.each([{ host: "district-iq.trycloudflare.com" }, { host: "localhost:3000", "x-forwarded-for": "203.0.113.9" }, { host: "127.0.0.1:3000", "cf-connecting-ip": "203.0.113.9" }, { host: "192.168.1.20:3000" }, {}])("refused %o", (x) => expect(localOnly(h(x))).toBe(false));
});
