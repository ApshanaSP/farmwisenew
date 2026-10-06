/**
 * Makes the Data Studio's sample files (data/studio-samples/). Synthetic, and labelled so on the page, but built on
 * Chennai's real wards, zones and localities, and as messy as real department exports, so every Studio step has
 * something to do: title rows, merged zone cells, spelling variants, duplicates, unreadable and future dates, an
 * outlier, a total row, Tamil headers, mixed date formats.
 *
 * Where the work sits follows the store's own flooding incidents (data/aws-cache, the AWS build), so the Linker has a
 * real pattern to find; the numbers are generated, not observed. Deterministic (seeded): run it again and the files are
 * the same for the same build.
 *
 *   node scripts/make-studio-samples.cjs
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "data", "aws-cache");
const OUT = path.join(ROOT, "data", "studio-samples");
fs.mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ helpers --
let seed = 20261005;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pad = (n) => String(n).padStart(2, "0");
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const day = (s) => Date.parse(s + "T00:00:00Z");
const fmtIndian = (s, sep = ".") => `${s.slice(8, 10)}${sep}${s.slice(5, 7)}${sep}${s.slice(0, 4)}`;
const weighted = (items, w) => { const t = w.reduce((a, b) => a + b, 0); let r = rnd() * t; for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

function table(name) {
  const f = fs.readdirSync(CACHE).find((x) => x.startsWith(name + "-") && x.endsWith(".json.gz"));
  if (!f) throw new Error(`No ${name} in data/aws-cache: start the website once with DATA_BACKEND=aws so the build is downloaded.`);
  const s = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CACHE, f))));
  const ix = Object.fromEntries(s.columns.map(([c], i) => [c, i]));
  return s.rows.map((r) => new Proxy(r, { get: (t, k) => t[ix[k]] }));
}

const wards = table("ref_wards").map((w) => ({ ward: w.ward_no, zone: w.zone_no, zoneName: w.zone_name, lat: w.centroid_lat, lon: w.centroid_lon, low: w.low_lying_index }));
const incidents = table("incidents").map((i) => ({ z: i.zone_no, fam: i.family, cat: i.category_code, d: String(i.first_reported_at).slice(0, 10) }));
const ref = require(path.join(ROOT, "data", "gcc-reference", "intel-reference.json"));
const nearest = (lat, lon) => {
  let best = null, bd = Infinity;
  for (const w of wards) { const d = Math.hypot((w.lat - lat) * 111.2, (w.lon - lon) * 111.2 * Math.cos((lat * Math.PI) / 180)); if (d < bd) { bd = d; best = w; } }
  return bd <= 2 ? best : null;
};
const localities = ref.places.filter((p) => p.kind === "locality").map((p) => ({ name: p.name, w: nearest(p.lat, p.lon) })).filter((x) => x.w);
const zoneName = new Map(wards.map((w) => [w.zone, w.zoneName]));
const zones = [...zoneName.keys()].sort((a, b) => a - b);
const flood = (from, to, zone) => incidents.filter((i) => (i.fam === "FLOOD" || i.cat === "DRAINAGE_SEWAGE") && i.d >= from && i.d <= to && (zone == null || i.z === zone)).length;

// ============================================================ 1. SWD register --
(function swd() {
  const from = "2026-06-01", to = "2026-09-30";
  const fz = new Map(zones.map((z) => [z, flood(from, to, z)]));
  const rows = [];
  const types = ["Desilting of SWD", "Desilting of SWD", "Desilting of SWD", "Culvert cleaning", "Missing link drain", "Inlet chamber repair", "Silt catch pit cleaning", "Drain slab replacement"];
  const contractors = ["Sri Murugan Constructions", "Annai Infra Works", "M/s. Balaji Engineering", "Coastal Civil Contractors", "Departmental (GCC)", "Sree Vinayaga Enterprises"];
  let n = 0;
  for (const z of zones) {
    const f = fz.get(z) || 0;
    // a zone's workload and backlog lean on its flooding, with each zone's own circumstances mixed in (a real link, not a copy)
    const count = 40 + Math.round(f * 0.25 * (0.4 + rnd() * 1.2)) + int(0, 30);
    const zw = wards.filter((w) => w.zone === z);
    const zl = localities.filter((l) => l.w.zone === z);
    const pendingShare = Math.min(0.55, 0.1 + (f / (Math.max(...fz.values()) || 1)) * 0.3 * (0.35 + rnd() * 1.2) + rnd() * 0.08);
    for (let k = 0; k < count; k++) {
      n++;
      const loc = zl.length && rnd() < 0.7 ? pick(zl) : null;
      const w = loc ? loc.w : pick(zw);
      const t = day(from) + Math.floor(rnd() * (day(to) - day(from)));
      const age = (day(to) - t) / 86400_000;
      const p = rnd();
      const status = p < pendingShare * (0.7 + age / 300) ? pick(["Pending", "Pending", "Not Started"]) : p < pendingShare + 0.16 ? "In Progress" : "Completed";
      const len = int(40, 900);
      rows.push({
        sno: n, id: `SWD/Z${pad(z)}/${String(1000 + n)}`, zone: `Zone ${z} - ${zoneName.get(z)}`, ward: w.ward, loc: loc ? loc.name : `Ward ${w.ward} area`,
        type: pick(types), date: iso(t), status, len, cost: Math.round((len * int(900, 1800)) / 100) * 100, contractor: pick(contractors),
        remarks: status === "Completed" ? pick(["Work completed, silt removed", "Completed and verified by AE", "Done"]) : status === "In Progress" ? pick(["Machinery deployed", "50% completed", "Work under progress"]) : pick(["Awaiting machinery", "Tender stage", "Traffic police NOC awaited", "Pending due to rain", ""])
      });
    }
  }
  // the messy parts of a real register
  const typo = { Velachery: ["Velacheri", "VELACHERY"], Perungudi: ["Perungudy"], Adyar: ["Adayar"], Mylapore: ["Mylapur", "MYLAPORE"], Saidapet: ["Saidapettai"], Kodambakkam: ["Kodambakam"] };
  for (const r of rows) if (typo[r.loc] && rnd() < 0.3) r.loc = pick(typo[r.loc]);
  for (const r of rows) if (rnd() < 0.08) r.status = pick({ Pending: ["pending", "PENDING ", "Pending "], "In Progress": ["In-Progress", "in progress"], Completed: ["Completed ", "COMPLETED"], "Not Started": ["Not started"] }[r.status] || [r.status]);
  const dups = [5, 41, 88, 130, 190, 260, 333].filter((i) => i < rows.length).map((i) => ({ ...rows[i] }));
  rows.splice(120, 0, ...dups.slice(0, 3));
  rows.push(...dups.slice(3));
  rows[17].date = "2027-10-12"; rows[99].date = "2027-09-08"; rows[240 % rows.length].date = "NA";
  rows[61].cost = 9850000;
  rows.sort((a, b) => Number(a.zone.match(/\d+/)[0]) - Number(b.zone.match(/\d+/)[0]) || a.ward - b.ward);
  rows.forEach((r, i) => (r.sno = i + 1));

  const head = ["S.No", "Work ID", "Zone", "Ward No.", "Locality", "Type of Work", "Date of Complaint", "Status", "Length (m)", "Estimated Cost (Rs.)", "Contractor", "Remarks"];
  const aoa = [
    ["GREATER CHENNAI CORPORATION"],
    ["STORM WATER DRAIN DEPARTMENT - DESILTING WORKS STATUS AS ON 30.09.2026"],
    [],
    head,
    ...rows.map((r) => [r.sno, r.id, r.zone, r.ward, r.loc, r.type, /^\d{4}-/.test(r.date) ? fmtIndian(r.date) : r.date, r.status, r.len, r.cost, r.contractor, r.remarks]),
    ["TOTAL", "", "", "", "", "", "", "", rows.reduce((s, r) => s + r.len, 0), rows.reduce((s, r) => s + r.cost, 0), "", ""]
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // the zone written once per block of rows, as departments do
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } }];
  let start = 4;
  for (let i = 4; i <= aoa.length - 1; i++) {
    if (i === aoa.length - 1 || aoa[i][2] !== aoa[start][2]) {
      if (i - 1 > start) {
        merges.push({ s: { r: start, c: 2 }, e: { r: i - 1, c: 2 } });
        for (let k = start + 1; k < i; k++) delete ws[XLSX.utils.encode_cell({ r: k, c: 2 })];
      }
      start = i;
    }
  }
  ws["!merges"] = merges;
  ws["!cols"] = [6, 16, 22, 9, 20, 22, 16, 13, 11, 18, 26, 30].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Desilting Works");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Prepared by", "Executive Engineer, SWD"], ["Note", "Status as reported by zonal AEs"]]), "Notes");
  XLSX.writeFile(wb, path.join(OUT, "GCC_SWD_Desilting_Register_Sep2026.xlsx"));
  console.log(`SWD register: ${rows.length} rows (+ title, total), ${merges.length - 2} merged zone blocks`);
})();

// ====================================================== 2. fever surveillance --
(function fever() {
  const hospitals = [
    ["UPHC Velachery", "Velachery"], ["Govt Peripheral Hospital, Anna Nagar", "Anna Nagar"], ["RSRM Hospital", "Royapuram"], ["UPHC Saidapet", "Saidapet"],
    ["Govt Peripheral Hospital, K.K. Nagar", "K.K. Nagar"], ["UPHC Perungudi", "Perungudi"], ["UPHC Mylapore", "Mylapore"], ["Govt Hospital, Tondiarpet", "Tondiarpet"],
    ["UPHC Kodambakkam", "Kodambakkam"], ["UPHC Adyar", "Adyar"], ["Govt Peripheral Hospital, Periyar Nagar", "Perambur"], ["UPHC Sholinganallur", "Sholinganallur"],
    ["UPHC Thiruvottiyur", "Thiruvottiyur"], ["UPHC Ambattur", "Ambattur"], ["UPHC Alandur", "Alandur"], ["UPHC Valasaravakkam", "Valasaravakkam"]
  ];
  const locZone = (name) => {
    const l = localities.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (l) return l.w.zone;
    const z = [...zoneName.entries()].find(([, n]) => n.toLowerCase() === name.toLowerCase());
    return z ? z[0] : null;
  };
  const weeks = [];
  for (let t = day("2026-04-18"); t <= day("2026-10-03"); t += 7 * 86400_000) weeks.push(iso(t));
  const lines = [["Week Ending", "Hospital", "Area", "Fever Cases", "Dengue Suspected", "Dengue Confirmed", "Admitted"]];
  for (const w of weeks) {
    for (const [h, area] of hospitals) {
      const z = locZone(area);
      // fever follows waterlogging in the hospital's zone about a week later
      const lagFrom = iso(day(w) - 13 * 86400_000), lagTo = iso(day(w) - 7 * 86400_000);
      const f = z ? flood(lagFrom, lagTo, z) : 0;
      const cases = Math.max(3, Math.round(22 + f * 2.4 + (rnd() - 0.5) * 22));
      const sus = Math.round(cases * (0.08 + f * 0.012 + rnd() * 0.04));
      lines.push([fmtIndian(w, "/"), h, area, cases, sus, Math.round(sus * (0.3 + rnd() * 0.2)), Math.round(cases * (0.06 + rnd() * 0.05))]);
    }
  }
  // a few blanks and a duplicate week entry, as in real returns
  lines[37][3] = ""; lines[120][4] = "NIL"; lines.splice(200, 0, [...lines[199]]);
  fs.writeFileSync(path.join(OUT, "Fever_Surveillance_Weekly_2026.csv"), "﻿" + lines.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\r\n"));
  console.log(`Fever surveillance: ${lines.length - 1} rows, ${weeks.length} weeks x ${hospitals.length} hospitals`);
})();

// ============================================================== 3. PDS stock --
(function pds() {
  const head = ["கடை எண் / Shop No", "பகுதி / Area", "மண்டலம் / Zone", "அரிசி இருப்பு (கிலோ) / Rice stock (kg)", "சர்க்கரை (கிலோ) / Sugar (kg)",
    "துவரம் பருப்பு (கிலோ) / Toor dal (kg)", "குடும்ப அட்டைகள் / Ration cards", "கடைசி விநியோகம் / Last supply", "நிலை / Status"];
  const lines = [head];
  const status = ["போதுமானது / Adequate", "குறைவு / Low", "இருப்பு இல்லை / Out of stock"];
  for (let i = 1; i <= 236; i++) {
    const l = pick(localities);
    const z = l.w.zone;
    const zoneTxt = pick([`${zoneName.get(z)}`, `Zone ${z} - ${zoneName.get(z)}`, `ZONE-${z}`, `மண்டலம் ${z}`]);
    const cards = int(600, 2400);
    const s = weighted(status, [0.62, 0.27, 0.11]);
    const rice = s === status[2] ? 0 : s === status[1] ? int(80, 600) : int(1200, 9000);
    const t = day("2026-09-18") + int(0, 17) * 86400_000;
    const d = iso(t);
    const dateTxt = pick([fmtIndian(d, "-"), d, `${Number(d.slice(8, 10))} ${["Sep", "Oct"][Number(d.slice(5, 7)) - 9] || "Oct"} 2026`]);
    lines.push([`FP-${String(1000 + i)}`, l.name, zoneTxt, rice, s === status[2] ? 0 : int(40, 700), s === status[0] ? int(80, 500) : int(0, 90), cards, dateTxt, s]);
  }
  fs.writeFileSync(path.join(OUT, "PDS_Ration_Shop_Stock_Oct2026.csv"), "﻿" + lines.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\r\n"));
  console.log(`PDS stock: ${lines.length - 1} shops`);
})();
