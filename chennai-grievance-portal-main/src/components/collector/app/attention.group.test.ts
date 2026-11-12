// QA pass 7, console-sync-08: a merged My Tasks row is one task, so "Send back" acts on every incident of the group, as "Verify" does.
// Send back used to reopen the row's own incident only: the task stayed in My Tasks with another member as its row.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { taskActions, taskGroup } from "./Attention";
import type { Row } from "./lib";

const row: Row = { id: "INC-A", grp: "G1", grouped: 3, members: ["INC-B", "INC-A", "INC-C"], dept_name: "GCC SWM", type: "Garbage" };

describe("console-sync-08: Send back and Verify act on the whole group", () => {
  it("taskGroup is the row first, then every other member, each as a row", () => {
    expect(taskGroup(row).map((r) => r.id)).toEqual(["INC-A", "INC-B", "INC-C"]);
    expect(taskGroup({ id: "INC-X" }).map((r) => r.id)).toEqual(["INC-X"]);
  });
  it("the row's two buttons send the same incidents", async () => {
    const got: Record<string, string[]> = {};
    const act = taskActions({
      verify: async (rows) => { got.verify = rows.map((r) => String(r.id)); return true; },
      sendBack: async (rows) => { got.sendBack = rows.map((r) => String(r.id)); return true; }
    });
    await act.sendBack(row);
    await act.verify(row);
    expect(got.sendBack).toEqual(["INC-A", "INC-B", "INC-C"]);
    expect(got.verify).toEqual(got.sendBack);
  });
  it("the Send back button calls the group action", () => {
    const src = readFileSync(join(__dirname, "Attention.tsx"), "utf8").split("\n").filter((l) => l.includes("<button") && l.includes("Send back to the department"));
    expect(src).toHaveLength(1);
    expect(src[0]).toContain("onClick={() => act.sendBack(i)}");
  });
});
