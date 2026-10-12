import { describe, expect, it } from "vitest";
import { directTool } from "@/lib/assistant/direct";
import { detectIntent } from "@/lib/assistant/intent";

describe("questions answered by one console tool", () => {
  it.each([
    ["Which incidents need my verification?", "verification_queue"],
    ["What is awaiting my approval?", "verification_queue"],
    ["show my tasks", "verification_queue"],
    ["anything pending for me to verify?", "verification_queue"],
    ["Which department has the oldest pending work?", "dept_backlog"],
    ["Which department has the biggest backlog?", "dept_backlog"],
    ["slowest department in zone 5", "dept_backlog"],
    ["Show incidents reported by more than one newspaper but missing from the connected departmental application", "news_gaps"],
    ["incidents in multiple outlets with no department record", "news_gaps"]
  ])("%s -> %s", (q, tool) => expect(directTool(q)?.name).toBe(tool));

  it.each([
    ["What is the air quality today and is it getting worse?", "aqi", null],
    ["Which lakes are more than 90% full?", "lake_pct_full", 90],
    ["how full are the reservoirs", "lake_pct_full", null],
    ["How much rain fell today?", "rainfall_24h_mm", undefined]
  ])("reads %s as the environment readings", (q, metric, threshold) => {
    const d = directTool(q);
    expect(d?.name).toBe("environment");
    expect(d?.args.metric).toBe(metric);
    if (threshold !== undefined) expect(d?.args.above).toBe(threshold);
  });
  it.each(["How many air pollution complaints this week?", "rain related incidents in Adyar", "lake encroachment complaints"])(
    "leaves the incident question %s to the router", (q) => expect(directTool(q)).toBeNull());

  it("asks for more than one outlet on the multi-newspaper question", () => {
    expect(directTool("Show incidents reported by more than one newspaper but missing from the connected departmental application")?.args).toEqual({ minOutlets: 2 });
  });

  it.each([
    "Which zone needs attention now?", "How many severe incidents this week by department?", "Show missing person cases this month",
    "Which department handles drains?", "List the taluks with the highest number of unresolved incidents during the last month",
    "Who is the zonal officer for Zone 9?", "What is the oldest open complaint in Adyar?"
  ])("leaves %s to the router", (q) => expect(directTool(q)).toBeNull());
});

describe("resolved and overdue in the intent rules", () => {
  it("reads 'resolved' as closed work, not 'unresolved'", () => {
    expect(detectIntent("How many complaints were resolved yesterday?").resolved).toBe(true);
    expect(detectIntent("how many incidents were closed this week").resolved).toBe(true);
    expect(detectIntent("How many unresolved incidents this week?").resolved).toBe(false);
    expect(detectIntent("how many incidents are not resolved").resolved).toBe(false);
    expect(detectIntent("how many incidents this week").resolved).toBe(false);
  });
  it("recognises overdue work (the pattern held a backspace instead of a word boundary)", () => {
    expect(detectIntent("Which incidents are overdue?").overdue).toBe(true);
    expect(detectIntent("show incidents past their deadline").overdue).toBe(true);
    expect(detectIntent("show incidents this week").overdue).toBe(false);
  });
});
