/**
 * Manu Desk (மனு: a paper petition handed in at the Collector's office): what both the server and the screens need.
 * Safe to import from client components.
 */

/** The department code of the counter staff's officer account: it opens the Manu Desk and nothing else. */
export const PETITION_DEPT = "COL-PET";
export const PETITION_LOGIN_EMAIL = "petition@chennai.gov.in";

export const MANU_LIMITS = {
  maxPages: 8,
  /** after the browser has resized it; Claude takes up to 5 MB per image */
  maxImageBytes: 4_500_000,
  maxPdfBytes: 20_000_000,
  /** longest side of a photo after resizing in the browser */
  photoMaxPx: 2000,
  /** what one upload request may hold, checked before the body is read */
  maxRequestBytes: 42_000_000,
  pollMs: 2500
} as const;

export interface ManuDept { code: string; label: string; handles: string }

/** Where a petition can go: every department with an officer login that takes this kind of work. The first lines are the usual ones. */
export const MANU_DEPTS: ManuDept[] = [
  { code: "GCC-SWM", label: "Corporation Solid Waste", handles: "garbage collection, bins, street sweeping" },
  { code: "GCC-SWD", label: "Corporation Storm Water Drain", handles: "rain water drains, street flooding, rain water entering homes" },
  { code: "CMWSSB", label: "Metrowater", handles: "sewage overflow, sewer blocks, drinking water supply and quality" },
  { code: "GCC-ELE", label: "Corporation Electrical", handles: "street lights and street light poles" },
  { code: "GCC-ENG", label: "Corporation Engineering", handles: "damaged roads, road repair, building permissions, illegal construction" },
  { code: "TANGEDCO", label: "TANGEDCO", handles: "household electricity supply, power cuts, transformers, meters" },
  { code: "DIST-REV", label: "District Revenue", handles: "pensions and social security allowances, patta, land disputes, encroachment, ration cards, certificates" },
  { code: "POL-GCP", label: "Greater Chennai Police", handles: "crime, threats, harassment, police not acting" },
  { code: "HLT-DMS", label: "Government Hospitals", handles: "government hospitals, medicines, money or help for medical treatment" },
  { code: "GCC-HLT", label: "Corporation Health", handles: "stray dogs, mosquitoes, public sanitation illness, Corporation dispensaries" },
  { code: "GCC-EDU", label: "Corporation Education", handles: "Corporation schools and scholarships" },
  { code: "GCC-PRK", label: "Corporation Parks", handles: "parks, playgrounds, fallen trees" },
  { code: "GCC-REV", label: "Corporation Revenue", handles: "property tax, trade licences" },
  { code: "GCC-BRG", label: "Corporation Bridges", handles: "bridges and subways" },
  { code: "GCC-BLD", label: "Corporation Buildings", handles: "community halls, public toilets, Corporation buildings" },
  { code: "GCC-LND", label: "Corporation Land and Estate", handles: "Corporation land, shops and leases" },
  { code: "GCC-FWD", label: "Corporation Family Welfare", handles: "maternity care, child welfare, vaccination" },
  { code: "PWD-WRD", label: "PWD Water Resources", handles: "lakes, rivers, canals and flood banks" },
  { code: "TNPCB", label: "Pollution Control Board", handles: "air, water and noise pollution from factories and burning" },
  { code: "DIST-DM", label: "District Disaster Management", handles: "flood and cyclone relief, relief camps" },
  { code: "GCC-GAD", label: "Corporation Administration", handles: "anything that fits none of the others" }
];

export const manuDeptLabel = (code: string | null | undefined): string => MANU_DEPTS.find((d) => d.code === code)?.label ?? (code || "");

/** The fields the reader may say it could not read confidently. */
export const READ_FIELDS = ["name", "mobile", "door_no", "street", "area_en", "pincode", "ward", "date", "aadhaar_last4", "subject", "full_text"] as const;
export type ReadField = (typeof READ_FIELDS)[number];

/** How far the reading of a petition has got, as the desk shows it. Real progress from the server, never a timer. */
export interface ReadStage {
  step: "queued" | "paddle" | "ai" | "compare";
  /** the page PaddleOCR is on, and how many there are */
  page?: number;
  pages?: number;
  /** "off" when PaddleOCR could not take part */
  paddle?: "done" | "off";
}

/** The numbers PaddleOCR read differently from the AI OCR. */
export interface PaddleSaw { mobile?: string; pincode?: string; date?: string }

/** What the reader saw on the page, cleaned (clean.ts). */
export interface Reading {
  name: string | null;
  mobile: string | null;
  door_no: string | null;
  street: string | null;
  area_en: string | null;
  pincode: string | null;
  ward: number | null;
  date: string | null;
  aadhaar_last4: string | null;
  subject: string | null;
  problem_en: string;
  request_en: string;
  language: "ta" | "en" | "mixed";
  department: string;
  category: string;
  urgent: boolean;
  unsure_fields: ReadField[];
  full_text: string;
  /** who read it: both steps, the AI OCR alone (PaddleOCR off), or PaddleOCR alone (AI OCR unavailable). Absent on older petitions. */
  readers?: "paddle+ai" | "ai" | "paddle";
  paddle_saw?: PaddleSaw;
}

/** The earlier petitions and complaints a new one looks like (repeat.ts). */
export interface RepeatMatch {
  code: string;
  incidentId: string | null;
  filedAt: string;
  status: string;
  problem: string;
  dept: string;
  samePerson: boolean;
  sameProblem: boolean;
  open: boolean;
}
export interface Repeats { headline: string | null; matches: RepeatMatch[]; attachTo: string | null }

/** What became of the SMS to the petitioner: sent, test (a copy went to the team inbox, not the phone), failed (tried again later), off (not set up), none (no valid mobile number). */
/**
 * What the desk is told about a petition's first SMS. "sending": still on its way. "unsure": the SMS service may have it but did not confirm,
 * so it is not sent again. "testnumber": a live send that went to SMS_TEST_NUMBER (last4 is that number's), not to the petitioner (QA pass 6).
 */
export interface SmsNote { state: "sent" | "test" | "testnumber" | "sending" | "unsure" | "failed" | "off" | "none"; last4: string | null }

/** What the desk shows once a petition has been approved and sent. */
export interface Approved {
  code: string;
  dept: string;
  attached: boolean;
  sms: SmsNote;
}
