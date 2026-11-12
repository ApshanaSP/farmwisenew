import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { nextStep, stepsOf } from "@/lib/officer/stages";

// officer-day-26: for a case the department closes itself the officer's step bar ticked "Sent to Collector" (the closed stage's index
// is 3 on the one four-step bar), and the API's "next" said "send" for every non-severe case in action, where the step is "close".
vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

const bar = async (stage: "new" | "approved" | "action" | "sent" | "verified" | "closed", severe: boolean, closedByDept: boolean) => {
  const { Steps } = await import("@/components/officer/Drawer");
  const html = renderToStaticMarkup(createElement(Steps, { stage, severe, closedByDept }));
  const steps = [...html.matchAll(/<div(?: class="([^"]*)")?><s>.*?<\/s>([^<]+)<\/div>/g)].map((m) => ({ cls: m[1] ?? "", label: m[2] }));
  return { html, labels: steps.map((s) => s.label), done: steps.filter((s) => s.cls === "dn").map((s) => s.label) };
};

describe("officer-day-26: the step bar and the API's next step follow the path the case is on", () => {
  it("a case the department closed: three steps, all done, and no 'Sent to Collector'", async () => {
    const b = await bar("verified", false, true);
    expect(b.labels).toEqual(["Received", "In action", "Closed by your department"]);
    expect(b.done).toEqual(b.labels);
    expect(b.html).not.toContain("Sent to Collector");
    expect(b.html).toContain('class="wfs n3"');
  });

  it("a non-severe case in action: Received done, In action current, the department's close to come", async () => {
    const b = await bar("action", false, false);
    expect(b.labels).toEqual(["Received", "In action", "Closed by your department"]);
    expect(b.done).toEqual(["Received"]);
  });

  it("a severe case keeps the four steps through the Collector", async () => {
    const b = await bar("sent", true, false);
    expect(b.labels).toEqual(["Received", "In action", "Sent to Collector", "Verified"]);
    expect(b.done).toEqual(["Received", "In action"]);
    expect((await bar("verified", true, false)).done).toEqual(["Received", "In action", "Sent to Collector", "Verified"]);
  });

  it("a non-severe case the Collector verified without it being sent is not drawn as sent", () => {
    expect(stepsOf("verified", false, false)).toEqual({ labels: ["Received", "In action", "Verified by Collector"], at: 2 });
  });

  it("next step: approve, then send for a severe case and close for any other", () => {
    expect(nextStep("new", "Medium")).toBe("approve");
    expect(nextStep("approved", "Medium")).toBe("close");
    expect(nextStep("action", "Low")).toBe("close");
    expect(nextStep("approved", "Severe")).toBe("send");
    expect(nextStep("action", "Severe")).toBe("send");
    expect(nextStep("sent", "Medium")).toBe("close");
    expect(nextStep("sent", "Severe")).toBeNull();
    expect(nextStep("verified", "Medium")).toBeNull();
  });
});
