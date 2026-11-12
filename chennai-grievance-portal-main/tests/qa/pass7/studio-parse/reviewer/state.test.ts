/**
 * Reviewer probe (QA pass 7, studio-parse): state left in a reused reader by one Collector's file changes how the next Collector's file reads.
 * SheetJS keeps one global number-format table; a legacy .xls whose FORMAT record redefines id 14 (the built-in date) writes into it, and the
 * .xls reader never resets it (only an .xlsx read does). The next .xls in the same reader then has its dates read as plain numbers.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/state.test.ts < /dev/null
 */
import { afterEach, expect, it, vi } from "vitest";
import { parseAllAsync } from "@/lib/studio/parse";
import { readerState, stopReaders } from "@/lib/studio/parse-pool";
import { datesXls, poisonXls } from "./xls.mjs";

afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

it("another Collector's crafted .xls read just before does not change how a register's dates read", async () => {
  stopReaders();
  vi.stubEnv("STUDIO_PARSE_PROCS", "1");
  const dates: Buffer = datesXls(), poison: Buffer = poisonXls();
  const before = (await parseAllAsync(dates, "register.xls"))[0];
  const pid = readerState().procs[0]?.pid;
  await parseAllAsync(poison, "amounts.xls");
  const after = (await parseAllAsync(dates, "register.xls"))[0];
  console.log("xls dates:", { pid, samePid: readerState().procs[0]?.pid === pid, before: before.rows[0], after: after.rows[0] });
  expect(after.rows).toEqual(before.rows);
}, 60_000);
