/**
 * S-5: a session ends when the user signs out, changes or resets the password, or is deactivated: the token carries the
 * account's token_version and every session read checks it. The cookie jar and the users table are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  users: new Map<number, { is_active: number; token_version: number | null }>(),
  /** a database before migration 013: the column is not there */
  noColumn: false
}));

vi.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (h.jar.has(n) ? { value: h.jar.get(n) } : undefined) }),
  headers: () => new Headers({ "x-dcd-portal": "collector" })
}));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, params: unknown[]) => {
      if (h.noColumn && /token_version/.test(sql) && !/0 AS token_version/.test(sql)) {
        throw Object.assign(new Error("Unknown column 'token_version' in 'field list'"), { code: "ER_BAD_FIELD_ERROR" });
      }
      const u = h.users.get(Number(params[0]));
      if (/^UPDATE users SET token_version/.test(sql)) {
        if (u) u.token_version = (u.token_version ?? 0) + 1;
        return [{ affectedRows: u ? 1 : 0 }];
      }
      if (/FROM users/.test(sql)) return [u ? [{ is_active: u.is_active, token_version: /0 AS token_version/.test(sql) ? 0 : u.token_version }] : []];
      throw new Error("unexpected query " + sql);
    }
  }
}));

import { signToken } from "@/lib/jwt";
import { getActivePortalSession, getSessionFromCookies, revokeSessions } from "@/lib/auth";

const COLLECTOR = { userId: 7, email: "c@x", role: "collector" as const, departmentId: null };

beforeEach(() => {
  h.jar.clear();
  h.noColumn = false;
  h.users.set(7, { is_active: 1, token_version: null });
});

describe("ending sessions (S-5)", () => {
  it("a token issued before the column existed (no tv) is valid while the account's version is 0", async () => {
    h.jar.set("dcd_session_collector", await signToken(COLLECTOR));
    expect((await getActivePortalSession("collector"))?.userId).toBe(7);
  });

  it("signing out (or a password change) ends every copy of the old token", async () => {
    h.jar.set("dcd_session_collector", await signToken({ ...COLLECTOR, tv: 0 }));
    expect(await getSessionFromCookies()).not.toBeNull();
    const tv = await revokeSessions(7);
    expect(tv).toBe(1);
    expect(await getSessionFromCookies()).toBeNull();
    expect(await getActivePortalSession("collector")).toBeNull();
    // the fresh token this browser gets after a password change works
    h.jar.set("dcd_session_collector", await signToken({ ...COLLECTOR, tv }));
    expect((await getActivePortalSession("collector"))?.tv).toBe(1);
  });

  it("a deactivated account is refused at once", async () => {
    h.jar.set("dcd_session_collector", await signToken({ ...COLLECTOR, tv: 0 }));
    h.users.get(7)!.is_active = 0;
    expect(await getActivePortalSession("collector")).toBeNull();
  });

  it("still signs in on a database without migration 013 (nothing to revoke there)", async () => {
    h.noColumn = true;
    h.jar.set("dcd_session_collector", await signToken({ ...COLLECTOR }));
    expect((await getActivePortalSession("collector"))?.userId).toBe(7);
    await expect(revokeSessions(7)).resolves.toBe(0);
  });
});
