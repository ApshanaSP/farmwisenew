/**
 * Reviewer 2 probe (QA pass 7, studio-parse): resetFormats (parse.ts) does not change how ordinary workbooks read. Workbooks with custom number
 * and date formats (.xlsx and legacy .xls), read in-thread (parseAll) and in the reader (parseAllAsync), before and after a crafted .xls that
 * redefines format 14, give the same cells.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer2/formats.test.ts < /dev/null
 */
import * as XLSX from "xlsx";
import { afterEach, expect, it, vi } from "vitest";
import { parseAll, parseAllAsync } from "@/lib/studio/parse";
import { stopReaders } from "@/lib/studio/parse-pool";
import { poisonXls } from "../reviewer/xls.mjs";

afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

const FMTS = ["dd/mm/yyyy", "yyyy-mm-dd hh:mm", "0.00%", "[$-409]d-mmm-yy;@", "#,##0.00", "m/d/yy", "mmm-yy", "h:mm AM/PM", "dd-mm-yyyy", "0.000"];
function book(type: "xlsx" | "biff8"): Buffer {
  const aoa: (string | number)[][] = [["ward", ...FMTS.map((f, i) => `c${i} ${f}`)]];
  for (let r = 0; r < 8; r++) aoa.push([`W${r}`, ...FMTS.map((_, i) => 46000 + r * 3.25 + i)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 2; r <= 9; r++) FMTS.forEach((f, i) => { ws[XLSX.utils.encode_cell({ r: r - 1, c: i + 1 })].z = f; });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data");
  return XLSX.write(wb, { type: "buffer", bookType: type });
}

it("custom formats: in-thread and reader agree, and a crafted .xls read in between changes nothing", async () => {
  stopReaders();
  vi.stubEnv("STUDIO_PARSE_PROCS", "1");
  const files: [Buffer, string][] = [[book("xlsx"), "custom.xlsx"], [book("biff8"), "custom.xls"]];
  for (const [buf, name] of files) {
    const local = parseAll(buf, name)[0];
    const before = (await parseAllAsync(buf, name))[0];
    await parseAllAsync(poisonXls(), "amounts.xls");
    parseAll(poisonXls(), "amounts.xls");
    const after = (await parseAllAsync(buf, name))[0];
    const localAfter = parseAll(buf, name)[0];
    console.log(name, "row 0:", local.rows[0]);
    expect(before.rows).toEqual(local.rows);
    expect(after.rows).toEqual(local.rows);
    expect(localAfter.rows).toEqual(local.rows);
  }
}, 120_000);
