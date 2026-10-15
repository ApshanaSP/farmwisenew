import { afterEach, describe, expect, it, vi } from "vitest";
import { missingSchema, orEmpty, orNull } from "./fallback";

afterEach(() => vi.restoreAllMocks());

describe("optional-data fallbacks", () => {
  it("are quiet only when the table or column is missing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(Promise.reject(Object.assign(new Error("x"), { code: "ER_NO_SUCH_TABLE" })).catch(orEmpty("t"))).resolves.toEqual([]);
    await expect(Promise.reject(new Error("no such table: anomalies")).catch(orNull("t"))).resolves.toBeNull();
    expect(err).not.toHaveBeenCalled();
    await expect(Promise.reject(new Error("database is locked")).catch(orEmpty("insights:241"))).resolves.toEqual([]);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("insights:241"));
  });
  it("knows MySQL's and SQLite's wording", () => {
    expect(missingSchema({ code: "ER_BAD_FIELD_ERROR" })).toBe(true);
    expect(missingSchema(new Error("Table 'district_intel.metrics' doesn't exist"))).toBe(true);
    expect(missingSchema(new Error("syntax error near FROM"))).toBe(false);
  });
});
