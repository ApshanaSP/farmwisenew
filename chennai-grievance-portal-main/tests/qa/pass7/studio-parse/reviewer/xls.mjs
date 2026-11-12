// Two legacy .xls (BIFF8) files: a register with dates (format 14, the built-in date), and one whose FORMAT record redefines id 14 as "0.000".
import * as XLSX from "xlsx";
export function datesXls() {
  const ws = XLSX.utils.aoa_to_sheet([["ward", "inspected on", "complaints"], ...Array.from({ length: 6 }, (_, i) => [`W${i}`, new Date(Date.UTC(2026, 9, i + 1)), i * 3])]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data");
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" });
}
export function poisonXls() {
  const ws = XLSX.utils.aoa_to_sheet([["ward", "amount"], ...Array.from({ length: 6 }, (_, i) => [`W${i}`, i + 0.5])]);
  for (let r = 2; r <= 7; r++) ws[`B${r}`].z = "0.000";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data"); wb.SSF = { 164: "0.000" };
  const buf = XLSX.write(wb, { type: "buffer", bookType: "biff8" });
  let hits = 0;
  for (let i = 0; i + 5 < buf.length; i++) if (buf[i] === 0x1e && buf[i + 1] === 0x04 && buf[i + 4] === 0xa4 && buf[i + 5] === 0x00) { buf[i + 4] = 0x0e; hits++; }
  if (hits !== 1) throw new Error(`FORMAT record for id 164 found ${hits} times`);
  return buf;
}
