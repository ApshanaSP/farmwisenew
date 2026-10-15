/** S-8: a change to a connected source and its audit row are one transaction; a failed audit row undoes the change. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ log: [] as string[], failAudit: false }));
vi.mock("@/lib/collector/db", () => {
  const conn = {
    query: async (sql: string) => {
      h.log.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
      if (/audit_log/.test(sql) && h.failAudit) throw new Error("audit table is read-only");
      return [{ affectedRows: 1, insertId: 9 }];
    },
    beginTransaction: async () => void h.log.push("BEGIN"),
    commit: async () => void h.log.push("COMMIT"),
    rollback: async () => void h.log.push("ROLLBACK"),
    release: () => undefined
  };
  return {
    default: {
      getConnection: async () => conn,
      query: async (sql: string) => {
        h.log.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
        return [/FROM .*sources/.test(sql) ? [{ name: "Feed", kind: "rss", created_by: "c@x", enabled: 1, refresh_minutes: 60 }] : []];
      }
    },
    ops: (t: string) => `district_intel_ops.${t}`
  };
});

import { removeSource, updateSource } from "./sources";

beforeEach(() => { h.log = []; h.failAudit = false; });

describe("source changes are audited in the same transaction (S-8)", () => {
  it("commits the change with its audit row", async () => {
    await removeSource(3, "c@x");
    expect(h.log).toEqual(["SELECT name, kind,", "BEGIN", "DELETE FROM district_intel_ops.sources", "INSERT INTO district_intel_ops.audit_log", "COMMIT"]);
  });

  it("rolls the change back when the audit row cannot be written", async () => {
    h.failAudit = true;
    await expect(updateSource(3, { enabled: false }, "c@x")).rejects.toThrow(/read-only/);
    expect(h.log).toContain("ROLLBACK");
    expect(h.log).not.toContain("COMMIT");
  });
});
