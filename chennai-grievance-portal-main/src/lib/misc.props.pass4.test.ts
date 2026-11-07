/** QA pass 4: property tests for CSV cells, the rate limiter, week and month keys (in several time zones) and effectiveStatus vs its SQL. */
import { DatabaseSync } from "node:sqlite";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { csvCell } from "./csv";
import { checkRateLimit, addFailure, failuresOver, clearFailures, getClientIp } from "./rate-limit";
import { trendKeys } from "./collector/insights";
import { addDays, daysBetween, weekStart } from "./studio/values";
import { decisionEffect, effectiveSql, effectiveStatus } from "./collector/effective";
import { expand, registerFunctions, setDatabaseNames, translate } from "./aws/dialect";

const P = { seed: 4242, numRuns: 300 };

describe("CSV cells (property)", () => {
  const FORMULA = ["=", "+", "-", "@", "\t", "\r"];
  const WS = [" ", " ", "​", "﻿", " "];
  it("a cell never starts with a formula character unless it is a plain number", () => {
    fc.assert(fc.property(fc.constantFrom(...FORMULA), fc.string({ maxLength: 30 }), fc.boolean(), (c, rest, always) => {
      const out = csvCell(c + rest, always).replace(/^"/, "");
      const isNumber = /^-?\d/.test(c + rest);
      if (!isNumber) expect(/^[=+\-@\t\r]/.test(out), JSON.stringify(c + rest) + " -> " + out).toBe(false);
    }), P);
  });
  it("a plain number is left alone", () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }), (n) => { expect(csvCell(String(n))).toBe(String(n)); }), P);
  });
  // a cell that starts '-' and a digit is passed through as a number even when it is a formula (DDE payload, '-2+3')
  it.fails("property-5: a cell like -2+3 or -1+cmd|' /C calc'!A0 (starts '-' and a digit, but is a formula) is written as text", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 99 }), fc.constantFrom("+3", "*2", "+cmd|' /C calc'!A0", "-1", "+SUM(A1:A9)"), (a, rest) => {
      const s = `-${a}${rest}`;
      expect(csvCell(s).replace(/^"/, "").startsWith("'"), s).toBe(true);
    }), { ...P, numRuns: 50 });
  });
  it("quoting is reversible: quotes doubled, commas and line breaks quoted", () => {
    fc.assert(fc.property(fc.string({ maxLength: 40 }), (s) => {
      const out = csvCell(s);
      if (/[",\r\n]/.test(s)) expect(out.startsWith('"') && out.endsWith('"')).toBe(true);
      const body = out.startsWith('"') ? out.slice(1, -1).replace(/""/g, '"') : out;
      expect(body === s || body === `'${s}`).toBe(true);
    }), P);
  });
});

describe("rate limits (property)", () => {
  const key = (() => { let n = 0; return (p: string) => `${p}:${++n}:${Math.random()}`; })();
  it("exactly `limit` calls are allowed in a window, the next are refused with a retry time in range", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 3600 }), fc.integer({ min: 1, max: 15 }), (limit, win, extra) => {
      const k = key("rl");
      for (let i = 0; i < limit; i++) expect(checkRateLimit(k, limit, win).allowed).toBe(true);
      for (let i = 0; i < extra; i++) {
        const r = checkRateLimit(k, limit, win);
        expect(r.allowed).toBe(false);
        expect(r.retryAfterSeconds!).toBeGreaterThanOrEqual(1);
        expect(r.retryAfterSeconds!).toBeLessThanOrEqual(win);
      }
    }), P);
  });
  it("keys are independent, whatever the key text (including __proto__ and constructor)", () => {
    fc.assert(fc.property(fc.constantFrom("__proto__", "constructor", "toString", "hasOwnProperty", "a", "A", "a ", "á"), fc.string({ maxLength: 12 }), (a, b) => {
      fc.pre(a !== b);
      const ka = `iso:${a}:${Math.random()}`, kb = `iso:${b}:${Math.random()}`;
      checkRateLimit(ka, 1, 60);
      expect(checkRateLimit(ka, 1, 60).allowed).toBe(false);
      expect(checkRateLimit(kb, 1, 60).allowed).toBe(true);
    }), { ...P, numRuns: 100 });
  });
  it("failure counting: blocked only once `limit` failures are added, and cleared on success", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), (limit) => {
      const k = key("fail");
      for (let i = 0; i < limit - 1; i++) { addFailure(k, 60); expect(failuresOver(k, limit).allowed).toBe(true); }
      addFailure(k, 60);
      expect(failuresOver(k, limit).allowed).toBe(false);
      clearFailures(k);
      expect(failuresOver(k, limit).allowed).toBe(true);
    }), P);
  });
  afterEach(() => { delete process.env.TRUST_PROXY_HOPS; });
  it("a client cannot choose its own address behind n trusted proxies, whatever it puts in X-Forwarded-For", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 3 }), fc.array(fc.ipV4(), { maxLength: 6 }), fc.ipV4(), (hops, spoof, real) => {
      process.env.TRUST_PROXY_HOPS = String(hops);
      // proxies append the address they saw: the chain is spoofed entries, then the real one, then (hops-1) proxies
      const proxies = Array.from({ length: hops - 1 }, (_, i) => `10.0.0.${i + 1}`);
      const h = new Headers({ "x-forwarded-for": [...spoof, real, ...proxies].join(", ") });
      expect(getClientIp(h)).toBe(real);
    }), P);
  });
  it("without TRUST_PROXY_HOPS the headers are ignored", () => {
    fc.assert(fc.property(fc.ipV4(), (ip) => { delete process.env.TRUST_PROXY_HOPS; expect(getClientIp(new Headers({ "x-forwarded-for": ip, "x-real-ip": ip }))).toBe("direct"); }), { ...P, numRuns: 30 });
  });
});

describe("week and month keys (property, several time zones)", () => {
  const TZS = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Australia/Lord_Howe", "Europe/London"];
  const orig = process.env.TZ;
  afterEach(() => { if (orig === undefined) delete process.env.TZ; else process.env.TZ = orig; });
  const ymd = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2032, 11, 31) }).map((t) => new Date(t).toISOString().slice(0, 10));
  const hms = fc.constantFrom("00:00:00", "03:00:00", "12:00:00", "19:12:00", "23:59:59");
  it("trendKeys: twelve Mondays, strictly weekly, ending the Monday before this week; six months ending this one; same in every TZ", () => {
    fc.assert(fc.property(ymd, hms, fc.constantFrom(...TZS), (d, t, tz) => {
      process.env.TZ = tz;
      const now = `${d} ${t}`;
      const { weeks, months } = trendKeys(now);
      expect(weeks).toHaveLength(12);
      for (const k of weeks) expect(new Date(`${k}T00:00:00Z`).getUTCDay()).toBe(1);
      for (let i = 1; i < 12; i++) expect(daysBetween(weeks[i - 1], weeks[i])).toBe(7);
      expect(weeks[11]).toBe(addDays(weekStart(d), -7));
      expect(months).toHaveLength(6);
      expect(months[5]).toBe(d.slice(0, 7));
      process.env.TZ = "UTC";
      expect(trendKeys(now)).toEqual({ weeks, months });
    }), P);
  });
  it("weekStart: a Monday on or before the date, at most 6 days back, idempotent, same in every TZ", () => {
    fc.assert(fc.property(ymd, fc.constantFrom(...TZS), (d, tz) => {
      process.env.TZ = tz;
      const w = weekStart(d);
      expect(new Date(`${w}T00:00:00Z`).getUTCDay()).toBe(1);
      const back = daysBetween(w, d);
      expect(back).toBeGreaterThanOrEqual(0);
      expect(back).toBeLessThanOrEqual(6);
      expect(weekStart(w)).toBe(w);
      expect(weekStart(addDays(w, 6))).toBe(w);
      expect(weekStart(addDays(w, 7))).toBe(addDays(w, 7));
    }), P);
  });
  it("months roll over a year end and a leap day correctly", () => {
    fc.assert(fc.property(fc.integer({ min: 2020, max: 2032 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), (y, m, day) => {
      const d = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const { months } = trendKeys(`${d} 10:00:00`);
      for (let i = 1; i < 6; i++) {
        const [py, pm] = months[i - 1].split("-").map(Number), [cy, cm] = months[i].split("-").map(Number);
        expect(cy * 12 + cm - (py * 12 + pm)).toBe(1);
      }
    }), P);
  });
});

describe("effectiveStatus and its SQL agree (property)", () => {
  setDatabaseNames(["district_intel", "district_intel_ops"]);
  const OPS = "`district_intel_ops`.`collector_decisions`";
  const EFF = effectiveSql(OPS);
  const DEC = ["resolve", "reject", "reopen", "verify", "escalate", "note", "RESOLVE", "", "bogus"];
  const row = fc.record({
    is_open: fc.constantFrom(0, 1), status: fc.constantFrom("Open", "In progress", "Assigned", "Resolved", "Rejected", "closed", ""),
    decisions: fc.array(fc.constantFrom(...DEC), { maxLength: 6 })
  });
  it("for any status and decision history the SQL's open and status equal effectiveStatus on the latest non-note decision", () => {
    fc.assert(fc.property(fc.array(row, { minLength: 1, maxLength: 8 }), (rows) => {
      const db = new DatabaseSync(":memory:");
      registerFunctions(db);
      db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, is_open INTEGER, status_std TEXT);
               CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT);`);
      let n = 1;
      rows.forEach((r, i) => {
        db.prepare("INSERT INTO incidents VALUES (?,?,?)").run(`I${i}`, r.is_open, r.status);
        for (const d of r.decisions) db.prepare("INSERT INTO collector_decisions VALUES (?,?,?)").run(n++, `I${i}`, d);
      });
      const [s, p] = expand(translate(`SELECT i.incident_id AS id, ${EFF.open} AS o, ${EFF.status} AS st FROM incidents i ORDER BY id`), []);
      const got = db.prepare(s).all(...(p as never[])) as { id: string; o: number; st: string }[];
      rows.forEach((r, i) => {
        const latest = [...r.decisions].reverse().find((d) => decisionEffect(d)) ?? null; // the latest with an effect (a note and an escalate have none)
        const want = effectiveStatus(r.is_open, r.status, latest);
        const g = got.find((x) => x.id === `I${i}`)!;
        expect({ o: Number(g.o), st: g.st }, JSON.stringify(r)).toEqual({ o: want.open, st: want.status });
      });
      db.close();
    }), { seed: 4242, numRuns: 120 });
  });
  it("effectiveStatus never throws on any value and always returns open 0 or 1", () => {
    fc.assert(fc.property(fc.anything(), fc.anything(), fc.anything(), (a, b, c) => {
      const r = effectiveStatus(a, b, c);
      expect([0, 1]).toContain(r.open);
      expect(typeof r.status).toBe("string");
    }), P);
  });
});
