import { describe, expect, it } from "vitest";
import { jobKeyOk } from "./jobauth";

describe("job key (BE-001)", () => {
  it("accepts the configured key", () => expect(jobKeyOk("s3cret-key", "s3cret-key")).toBe(true));
  it("refuses a wrong key, of the same or a different length", () => {
    expect(jobKeyOk("s3cret-kez", "s3cret-key")).toBe(false);
    expect(jobKeyOk("short", "s3cret-key")).toBe(false);
    expect(jobKeyOk("s3cret-key-and-more", "s3cret-key")).toBe(false);
  });
  it("refuses a missing header", () => {
    expect(jobKeyOk(null, "s3cret-key")).toBe(false);
    expect(jobKeyOk("", "s3cret-key")).toBe(false);
  });
  it("refuses everything when the server has no key", () => {
    expect(jobKeyOk("anything", "")).toBe(false);
    expect(jobKeyOk("", "")).toBe(false);
    expect(jobKeyOk("anything", null)).toBe(false);
    expect(jobKeyOk("anything", "   ")).toBe(false);
  });
});
