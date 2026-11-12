// QA4 gate fix: redteam-final-14. A new mobile number on the profile loses the Verified mark; the same number keeps it.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 7, email: "c@x.test", role: "citizen" }) }));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, args: unknown[] = []) => {
      const db = h.db as DatabaseSync;
      const s = sql.replace(/\bFALSE\b/g, "0").replace(/\bTRUE\b/g, "1");
      return /^\s*SELECT/i.test(s) ? [db.prepare(s).all(...(args as never[]))] : [db.prepare(s).run(...(args as never[]))];
    }
  }
}));

describe("the profile's mobile number and its Verified mark", () => {
  it("redteam-final-14: a different number clears it, the same number keeps it, no number keeps it", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE user_profiles (id INTEGER PRIMARY KEY, user_id INT, first_name TEXT, last_name TEXT, gender TEXT, date_of_birth TEXT, alternate_email TEXT, door_no_and_street TEXT, area TEXT, locality TEXT, pincode TEXT, zone_id INT, ward_number INT, mobile_number TEXT, mobile_verified INT DEFAULT 0, profile_photo TEXT)");
    db.prepare("INSERT INTO user_profiles (user_id, first_name, mobile_number, mobile_verified) VALUES (7, 'A', '9000000001', 1)").run();
    h.db = db;
    const { PUT } = await import("./route");
    const put = (body: object) => PUT(new Request("http://x/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never);
    const verified = () => (db.prepare("SELECT mobile_verified v, mobile_number n FROM user_profiles WHERE user_id = 7").get() as { v: number; n: string });
    expect((await put({ firstName: "A", mobileNumber: "9000000001" })).status).toBe(200);
    expect(verified()).toEqual({ v: 1, n: "9000000001" });
    expect((await put({ firstName: "A" })).status).toBe(200);
    expect(verified()).toEqual({ v: 1, n: "9000000001" });
    expect((await put({ firstName: "A", mobileNumber: "9000000002" })).status).toBe(200);
    expect(verified()).toEqual({ v: 0, n: "9000000002" });
  });
});
