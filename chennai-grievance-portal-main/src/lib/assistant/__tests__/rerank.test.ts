import { describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/gateway", () => ({ generateJson: gen }));
const { pickIncident, rerankPrompt } = await import("@/lib/assistant/rerank");

const c = (id: string, title: string, dead = 0) => ({ id, title, when: "2026-10-12T16:52:00Z", place: "Kodungaiyur", type: "x", dead, severity: "High" });
const cands = [c("A", "Road accident – Kodungaiyur", 1), c("B", "Two workers die while working inside Chennai corporation's stormwater well", 2)];

describe("the model picks the incident a question means", () => {
  it("lists every candidate with its deaths", () => {
    const p = rerankPrompt("Tell me about the Kodungaiyur gas deaths", cands);
    expect(p).toContain("1. Road accident – Kodungaiyur | 2026-10-12 | Kodungaiyur | x | 1 dead | High");
    expect(p).toContain("2. Two workers die while working inside Chennai corporation's stormwater well");
  });
  it("returns the model's pick, none, or nothing when the model fails", async () => {
    gen.mockResolvedValueOnce({ object: { pick: 2, sure: true } });
    expect(await pickIncident("gas deaths", cands)).toEqual({ index: 1, sure: true });
    gen.mockResolvedValueOnce({ object: { pick: 0, sure: false } });
    expect(await pickIncident("gas deaths", cands)).toEqual({ index: null, sure: false });
    gen.mockResolvedValueOnce({ object: { pick: 9, sure: true } });
    expect(await pickIncident("gas deaths", cands)).toEqual({ index: null, sure: true });
    gen.mockRejectedValueOnce(new Error("busy"));
    expect(await pickIncident("gas deaths", cands)).toBeUndefined();
    expect(await pickIncident("gas deaths", cands.slice(0, 1))).toBeUndefined();
  });
});
