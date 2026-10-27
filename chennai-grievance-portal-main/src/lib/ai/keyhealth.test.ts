import { afterEach, describe, expect, it } from "vitest";
import { adminNotice, isKeyRefusal, keyProblems, keyRefused, keyWorks } from "./keyhealth";

// LT-29: an expired Bedrock key used to fail silently.
describe("refused AI keys reach the admin banner", () => {
  afterEach(() => { global.__keyProblems?.clear(); global.__bedrockRefused = undefined; });

  it("a simulated 403 from Bedrock shows the banner with what to do", () => {
    expect(isKeyRefusal(403, "The security token included in the request is expired")).toBe(true);
    keyRefused("bedrock", 403, "The security token included in the request is expired");
    const n = adminNotice(keyProblems(), false);
    expect(n?.title).toBe("AI is off: every AI key was refused");
    expect(n?.line).toMatch(/Amazon Bedrock: key expired since \d\d:\d\d/);
    expect(n?.line).toMatch(/npm run ai:key/);
  });
  it("Bedrock's own record of refused AWS keys counts too", () => {
    global.__bedrockRefused = { key: `${process.env.AWS_REGION ?? ""}|${process.env.AWS_ACCESS_KEY_ID ?? ""}|${(process.env.AWS_SESSION_TOKEN ?? "").slice(-24)}|${(process.env.AWS_BEARER_TOKEN_BEDROCK ?? "").trim().slice(-24)}`, reason: "AWS keys expired" };
    expect(keyProblems().map((p) => [p.provider, p.reason])).toContainEqual(["bedrock", "key expired"]);
  });
  it("another provider still answering says so", () => {
    keyRefused("groq", 401, "Invalid API Key");
    expect(adminNotice(keyProblems(), true)?.line).toMatch(/Groq: key not accepted \(401\).*Another provider is answering/);
  });
  it("the banner goes once the provider answers again; a busy provider is not a key problem", () => {
    keyRefused("gemini", 403, "API key not valid");
    keyWorks("gemini");
    expect(adminNotice(keyProblems(), true)).toBeNull();
    expect(isKeyRefusal(429, "Rate limit reached")).toBe(false);
    expect(isKeyRefusal(503, "high demand")).toBe(false);
  });
});
