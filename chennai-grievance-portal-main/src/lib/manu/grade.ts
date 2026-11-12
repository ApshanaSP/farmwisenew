/**
 * How serious a website complaint is and what kind of case it makes, by the pipeline's own rules, so the case a complaint gets the
 * moment it is filed (cases.ts addCaseLive) carries the severity and deadline the pipeline would give it. Every online complaint was
 * Medium with a flat 120-hour deadline, so an "EB wire cut/Spark seen" hazard (High, 24 h by the pipeline) was due in 5 days and a garbage
 * complaint (Low, 72 h) in 120 h, and the officer's overdue, due-soon and serious counts were wrong for every website filing (QA pass 6,
 * officer-day-02).
 *
 * The rules are the pipeline's: the category crosswalk is district_intel/reference/category_map.yaml (grievance), the severity cues are
 * district_intel/dintel/textproc.py and the score is district_intel/dintel/severity.py grievance(). The deadline hours by category and
 * severity are not copied: they are read from the build's ref_categories (the pipeline writes categories.yaml's sla_h there).
 * tests/qa/pass7/desk-and-accounts/grade.test.ts reads those pipeline files and fails when this copy no longer matches them.
 */

// ------------------------------------------------------------------- category_map.yaml, grievance --
// exact sub-type, then sub-type pattern, then complaint type ("Other" is OTHER: the department the portal chose decides, see cases.ts)
export const SUBTYPE: Record<string, string> = {
  "Stagnation of Water": "FLOOD_WATERLOGGING",
  "Obstruction of Water Flow": "DRAINAGE_SEWAGE",
  "Repairs to Storm Water Drain": "DRAINAGE_SEWAGE",
  "New Drain Construction": "DRAINAGE_SEWAGE",
  "Desilting of Canal": "DRAINAGE_SEWAGE",
  "Desilting of Drain": "DRAINAGE_SEWAGE",
  "Disposal of Removed Silt on the Road": "DRAINAGE_SEWAGE",
  "Covering Manholes of Storm Water Drain": "DRAINAGE_SEWAGE",
  "Water entering Home/Shop": "FLOOD_WATERLOGGING",
  "Trap at home/ any place": "FLOOD_WATERLOGGING",
  "Pregnant women issues": "FLOOD_RELIEF",
  "Elderly Medicine": "FLOOD_RELIEF",
  "Food/Basic amenities demand": "FLOOD_RELIEF",
  "EB wire cut/Spark seen": "STREETLIGHT_ELECTRICAL",
  "Insufficient Barricading": "DRAIN_WORKS_SAFETY",
  "Illegal Parking on foot path": "TRAFFIC_OBSTRUCTION",
  "Unsafe dark spots/ corners": "DARK_SPOT_SAFETY",
  "Women related safety issues": "DARK_SPOT_SAFETY",
  "Cleanliness in footpath": "SOLID_WASTE",
  "Public defecation/urination": "SANITATION_TOILETS",
  "Electrical wires/obstruction on footpath": "STREETLIGHT_ELECTRICAL",
  "Removal of Shops in the Footpath": "ENCROACHMENT",
  "Street Dogs": "STRAY_ANIMALS",
  "Stray Cattle": "STRAY_ANIMALS",
  "Stray Pigs": "STRAY_ANIMALS",
  "Death of Stray Animals": "STRAY_ANIMALS",
  "Mosquito Menace": "VECTOR_DISEASE",
  "Public Health / Dengue / Malaria / Gastro Enteritis": "VECTOR_DISEASE",
  "Transfer Station Smell": "SOLID_WASTE",
  "Flies Menace from Dumping Ground": "SOLID_WASTE",
  "Biomedical waste / Health hazard waste removal": "SOLID_WASTE",
  "Complaints Regarding Plastics": "SOLID_WASTE",
  "Illegal Slaughtering": "FOOD_SAFETY",
  "Complaints regarding quality of food in hotels": "FOOD_SAFETY",
  "Road Side Eateries": "FOOD_SAFETY",
  "Complaints regarding unhygenic Restaurants": "FOOD_SAFETY",
  "Unauthorized Sale of Meat and Meat products": "FOOD_SAFETY",
  "Slaughter House related complaints": "FOOD_SAFETY",
  "Unhygenic and Improper Transport of Meat and Livestock": "FOOD_SAFETY",
  "Public toilet blockage": "SANITATION_TOILETS",
  "No water supply in public toilet": "SANITATION_TOILETS",
  "Public toilet cleaning": "SANITATION_TOILETS",
  "No electricity in public toilet": "SANITATION_TOILETS",
  "Open Defecation": "SANITATION_TOILETS",
  "Illegal Draining of Sewage to SWD / Open Site": "DRAINAGE_SEWAGE",
  "Safety in public toilets": "DARK_SPOT_SAFETY",
  "Illegal activities in toilet": "DARK_SPOT_SAFETY",
  "Inadequate lighting in and around the toilet": "DARK_SPOT_SAFETY",
  "Removal of Fallen Trees": "TREES_PARKS",
  "Tree Pruning": "TREES_PARKS",
  "Obstruction of Trees": "TREES_PARKS",
  "Unauthorized Tree Cutting": "TREES_PARKS",
  "Safety in parks/playgrounds": "DARK_SPOT_SAFETY",
  "Women related safety issues in parks": "DARK_SPOT_SAFETY",
  "Toilets in parks": "SANITATION_TOILETS",
  "Non functional lights/ no lights in parks": "STREETLIGHT_ELECTRICAL",
  "Violation of DCR/Building By laws": "ENCROACHMENT",
  "Unauthorized / Illegal Construction": "ENCROACHMENT",
  "Building Plan Sanction": "ADMIN_SERVICES",
  "Complaints regarding Burial Ground": "CIVIC_FACILITIES",
  "Complaints related to Schools": "CIVIC_FACILITIES",
  "Complaints related Shopping Complex": "CIVIC_FACILITIES",
  "Complaints regarding any other CoC building": "CIVIC_FACILITIES",
  "Complaints regarding Community Hall": "CIVIC_FACILITIES",
  "Slow Progress of Work": "PUBLIC_WORKS",
  "Poor Quality of Work": "PUBLIC_WORKS",
  "Unauthorized Advertisement Boards": "ENCROACHMENT",
  "Encroachment on the Public Property": "ENCROACHMENT",
  "Complaints regarding Bridges / Flyovers / Subways": "ROAD_DAMAGE",
  "Food Requirement": "FLOOD_RELIEF",
  "Relief Center Requirement": "FLOOD_RELIEF",
  "Parking Issue": "TRAFFIC_OBSTRUCTION",
  "Complaints related to issue of all types of Registration Certificate": "ADMIN_SERVICES",
  "Issue of Birth and Death Certificate": "ADMIN_SERVICES",
};
export const SUBTYPE_REGEX: [RegExp, string][] = [
  [/pothole/i, "ROAD_DAMAGE"],
  [/sewerage pipe/i, "DRAINAGE_SEWAGE"],
  [/encroaching/i, "ENCROACHMENT"],
  [/parking/i, "TRAFFIC_OBSTRUCTION"],
  [/water supply disrupted/i, "WATER_SUPPLY"],
];
export const TYPE: Record<string, string> = {
  "Water Stagnation": "FLOOD_WATERLOGGING",
  "Flood": "FLOOD_WATERLOGGING",
  "Storm Water Drains": "DRAIN_WORKS_SAFETY",
  "Garbage": "SOLID_WASTE",
  "Road and Footpath": "ROAD_DAMAGE",
  "Street Light": "STREETLIGHT_ELECTRICAL",
  "Public Health": "HEALTH_SERVICES",
  "Public Toilet": "SANITATION_TOILETS",
  "Park and Playground": "TREES_PARKS",
  "Air Quality": "AIR_POLLUTION",
  "Building Plan Permission": "ENCROACHMENT",
  "Tax and Licence": "ADMIN_SERVICES",
  "Voter ID": "ADMIN_SERVICES",
  "General": "CIVIC_FACILITIES",
  "MEGA STREETS - CONSTRUCTION PHASE": "PUBLIC_WORKS",
  "MEGA STREETS - OPERATION PHASE": "PUBLIC_WORKS",
  "MEGA STREETS - PLANNING PHASE": "PUBLIC_WORKS",
  "Other": "OTHER",
};

/** The case category for a complaint's type and sub-type, as the pipeline's grievance loader picks it (refdata.grievance_category). */
export function grievanceCategory(type: string | null | undefined, subtype: string | null | undefined): string {
  const sub = String(subtype ?? "");
  if (Object.prototype.hasOwnProperty.call(SUBTYPE, sub)) return SUBTYPE[sub];
  for (const [rx, code] of SUBTYPE_REGEX) if (rx.test(sub)) return code;
  const t = String(type ?? "");
  return Object.prototype.hasOwnProperty.call(TYPE, t) ? TYPE[t] : "OTHER";
}

// ----------------------------------------------------------------------- textproc.py, severity cues --
export const HIGH_RISK_SUB = /electric shock|eb wire|spark|manhole|sewage|fallen tree|dengue|malaria|mosquito|biomedical|trap at home|water entering|elderly medicine|pregnant women issues|damage to the electric pole/i;
export const ELEVATED_SUB = /stagnation of water|pot ?hole|street dogs|non burning of street lights|overflowing|burning of garbage|dark spot|safety|barricading|obstruction of water flow|desilting|removal of garbage|open defecation|electrical wires|stray cattle/i;
export const LOW_SUB = /certificate|registration|opening and closing hours|online payment|project information|consultation|information in advance|revision objection|name error/i;
export const TEXT_HAZARD = /live wire|electric shock|current shock|shock adikkudhu|open manhole|sewage overflow|electrocut|collapsed|caved in|மின்சாரம் தாக்|மின் கம்பி|திறந்த நிலையில் உள்ள|இடிந்து/i;
export const VULNERABLE: [string, RegExp][] = [
  ["school", /school|பள்ளி|anganwadi|அங்கன்வாடி/i],
  ["hospital", /hospital|மருத்துவமனை|health cent|\bphc\b|\buphc\b|சுகாதார நிலைய/i],
  ["bus_stop", /bus stop|bus stand|பேருந்து நிறுத்த/i],
  ["worship", /temple|kovil|koil|கோயில்|கோவில்|church|mosque|masjid|தேவாலய|பள்ளிவாசல்/i],
  ["children", /children|kids|pasanga|kozhandhai|குழந்தை|students|மாணவ/i],
  ["elderly", /elderly|old age|senior citizen|periyavanga|முதியோர்|முதியவர்|வயதான/i],
  ["pregnant", /pregnant|கர்ப்பிணி/i]
];
export const REPEAT = /already complained|already complaint|complained (twice|thrice|again|many times|\d+ times)|no action (taken|so far|till now)|still not (done|cleared|fixed|repaired|attended)|reminder|repeated complaint|thadava complaint|evlo thadava|பலமுறை|ஏற்கனவே[^.]*புகார்|மீண்டும் புகார்|நடவடிக்கை இல்லை/i;

// ------------------------------------------------------------------ severity.py, grievance() --
export type Level = "Severe" | "High" | "Medium" | "Low";
/** refdata.severity_level */
export const levelOf = (score: number): Level => (score >= 70 ? "Severe" : score >= 50 ? "High" : score >= 30 ? "Medium" : "Low");

export interface Grade { score: number; level: Level; reasons: string }

/**
 * A grievance's severity from its type, sub-type and words: the sub-type sets the base, a described hazard, vulnerable places (in the
 * text or the landmark) and a claim of complaining before add to it.
 */
export function gradeGrievance(g: { type?: string | null; subtype?: string | null; title?: string | null; text?: string | null; landmark?: string | null }): Grade {
  const sub = String(g.subtype ?? ""), cat = String(g.type ?? "");
  const text = `${g.title ?? ""} ${g.text ?? ""}`;
  const place = `${text} ${g.landmark ?? ""}`;
  const reasons: string[] = [];
  let score: number;
  if (cat === "Flood" || HIGH_RISK_SUB.test(sub)) { score = 35; reasons.push(`High-risk issue: ${sub} (+35)`); }
  else if (cat === "Tax and Licence" || cat === "Voter ID" || LOW_SUB.test(sub)) { score = 5; reasons.push(`Administrative issue: ${sub} (+5)`); }
  else if (ELEVATED_SUB.test(sub)) { score = 25; reasons.push(`Public-safety or sanitation issue: ${sub} (+25)`); }
  else { score = 15; reasons.push(`Civic issue: ${sub || cat} (+15)`); }
  if (TEXT_HAZARD.test(text)) { score += 15; reasons.push("Describes an immediate hazard (+15)"); }
  const vul = VULNERABLE.filter(([, rx]) => rx.test(place)).map(([name]) => name);
  if (vul.length) { const pts = Math.min(8 * vul.length, 24); score += pts; reasons.push(`Affects ${vul.join(", ")} (+${pts})`); }
  if (REPEAT.test(text)) { score += 10; reasons.push("Citizen reports complaining before (+10)"); }
  score = Math.min(score, 100);
  return { score, level: levelOf(score), reasons: reasons.join("; ") };
}

/** refdata.sla_hours: the column of ref_categories for a severity (Severe, High, Medium, Low; anything else is Low). */
export const SLA_COLUMN: Record<string, string> = { Severe: "sla_severe_h", High: "sla_high_h", Medium: "sla_medium_h", Low: "sla_low_h" };
