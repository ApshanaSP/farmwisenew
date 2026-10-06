/**
 * Sample files for trying the Studio (data/studio-samples/, made by scripts/make-studio-samples.cjs). They are
 * synthetic and labelled so on the page: built on Chennai's real wards and localities, and as messy as real
 * department exports (title rows, merged zone cells, spelling variants, duplicates, a total row, Tamil headers).
 */
import fs from "fs";
import path from "path";

export interface SampleInfo { key: string; file: string; title: string; dept: string; blurb: string; icon: "drop" | "health" | "leaf"; format: string }

export const SAMPLES: SampleInfo[] = [
  { key: "swd", file: "GCC_SWD_Desilting_Register_Sep2026.xlsx", title: "Storm-water drain desilting register", dept: "GCC Storm Water Drain",
    blurb: "Excel with a title row, merged zone cells, typos and a total row", icon: "drop", format: "Excel" },
  { key: "fever", file: "Fever_Surveillance_Weekly_2026.csv", title: "Fever & dengue surveillance", dept: "Government Hospitals",
    blurb: "Weekly cases per hospital: links with flooding week by week", icon: "health", format: "CSV" },
  { key: "pds", file: "PDS_Ration_Shop_Stock_Oct2026.csv", title: "Ration shop stock (Tamil headers)", dept: "Civil Supplies",
    blurb: "Tamil and English headers, mixed date formats", icon: "leaf", format: "CSV" }
];

export function sampleFile(key: string): { buf: Buffer; info: SampleInfo } | null {
  const info = SAMPLES.find((s) => s.key === key);
  if (!info) return null;
  try {
    return { buf: fs.readFileSync(path.join(process.cwd(), "data", "studio-samples", info.file)), info };
  } catch {
    return null;
  }
}

export function availableSamples(): SampleInfo[] {
  return SAMPLES.filter((s) => fs.existsSync(path.join(process.cwd(), "data", "studio-samples", s.file)));
}
