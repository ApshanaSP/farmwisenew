/**
 * PUT /api/profile on an isolated in-memory copy (AWS store translation). The complaint form saves only the details
 * it asked for; that save used to set every other column (date of birth, area, zone, ward...) to NULL. A changed
 * mobile number used to keep "verified" and skip the other-account check.
 */
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, params: unknown[] = []) => {
      const [s, p] = expand(translate(sql), params);
      const st = h.db.prepare(s);
      if (/^\s*SELECT/i.test(s)) return [st.all(...(p as never[]))];
      return [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
    }
  }
}));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 7, email: "c@test.local", role: "citizen" }) }));
const { PUT } = await import("./route");

const put = (body: unknown) =>
  PUT(new NextRequest("http://localhost/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const row = () => h.db.prepare(`SELECT * FROM user_profiles WHERE user_id = 7`).get() as Record<string, unknown>;

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE zones (id INTEGER PRIMARY KEY, ward_start INTEGER, ward_end INTEGER);
    CREATE TABLE user_profiles (id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE, first_name TEXT, last_name TEXT, gender TEXT,
      date_of_birth TEXT, mobile_number TEXT UNIQUE, mobile_verified INTEGER DEFAULT 0, alternate_email TEXT, door_no_and_street TEXT,
      area TEXT, locality TEXT, pincode TEXT, zone_id INTEGER, ward_number INTEGER, aadhaar_number_encrypted TEXT, aadhaar_last4 TEXT,
      profile_photo TEXT);
    INSERT INTO zones VALUES (13, 170, 182);
    INSERT INTO user_profiles (user_id, first_name, date_of_birth, alternate_email, area, locality, zone_id, ward_number, mobile_number, mobile_verified)
      VALUES (7, 'Meena', '1990-04-02', 'alt@test.local', 'Adyar', 'Gandhi Nagar', 13, 173, '9876543210', 1);
    INSERT INTO user_profiles (user_id, first_name, mobile_number) VALUES (8, 'Other', '9123456780');`);
});

describe("saving part of a profile", () => {
  it("the complaint form's save keeps every field it did not send", async () => {
    const r = await put({ firstName: "Meena", lastName: "", gender: "Female", doorNoAndStreet: "12, 3rd Street", pincode: "600020", mobileNumber: null });
    expect(r.status).toBe(200);
    expect(row()).toMatchObject({ gender: "Female", door_no_and_street: "12, 3rd Street", date_of_birth: "1990-04-02", alternate_email: "alt@test.local",
      area: "Adyar", locality: "Gandhi Nagar", zone_id: 13, ward_number: 173, mobile_number: "9876543210", mobile_verified: 1 });
  });

  it("the profile page (which sends every field) can still clear one", async () => {
    await put({ firstName: "Meena", lastName: "", gender: null, dateOfBirth: null, alternateEmail: null, doorNoAndStreet: null, area: null,
      locality: null, pincode: null, zoneId: null, wardNumber: null });
    expect(row()).toMatchObject({ area: null, zone_id: null, date_of_birth: null, mobile_number: "9876543210" });
  });

  // a saved number is changed only on the mobile tab, with a code (QA pass 6, hunt2-sec-02): the profile form leaves it as it is,
  // and does not say whether another account holds the number it was sent
  it("the profile form does not change a saved mobile number", async () => {
    expect((await put({ firstName: "Meena", mobileNumber: "9123456780" })).status).toBe(200);
    expect(row()).toMatchObject({ mobile_number: "9876543210", mobile_verified: 1 });
    expect((await put({ firstName: "Meena", mobileNumber: "9000000001" })).status).toBe(200);
    expect(row()).toMatchObject({ mobile_number: "9876543210", mobile_verified: 1 });
  });
});
