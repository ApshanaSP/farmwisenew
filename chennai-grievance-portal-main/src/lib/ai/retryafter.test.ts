import { describe, expect, it } from "vitest";
import { APICallError } from "ai";
import { retryAfterSeconds } from "@/lib/ai/gateway";

const err = (message: string, headers: Record<string, string> = {}) =>
  new APICallError({ message, url: "https://api.groq.com", requestBodyValues: {}, statusCode: 429, responseHeaders: headers });

describe("how long a rate-limited model rests", () => {
  it("reads the header, then Groq's message in seconds, minutes or hours", () => {
    expect(retryAfterSeconds(err("limited", { "retry-after": "12" }))).toBe(12);
    expect(retryAfterSeconds(err("Please try again in 7.535s"))).toBe(8);
    expect(retryAfterSeconds(err("Please try again in 1m2.5s"))).toBe(63);
    // a daily limit: once read as 3 s ("1h3m5s" matched only its seconds), so the model was asked again and refused
    expect(retryAfterSeconds(err("tokens per day (TPD): Limit 200000. Please try again in 1h3m5s"))).toBe(3785);
    expect(retryAfterSeconds(err("Please try again in 14m"))).toBe(840);
    expect(retryAfterSeconds(err("You exceeded your current quota"))).toBeNull();
  });
});
