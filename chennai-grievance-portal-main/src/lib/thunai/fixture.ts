/**
 * A test world for Thunai's golden set: the real reference lists (zones, taluks, categories from
 * data/gcc-reference/intel-reference.json, department codes from it) with plausible department names, so tests need
 * no database. Used by tests only.
 */
import type { ScreenState, World } from "./types";

export const WORLD: World = {
  zones: [
    [1, "Thiruvottiyur"], [2, "Manali"], [3, "Madhavaram"], [4, "Tondiarpet"], [5, "Royapuram"], [6, "Thiru-Vi-Ka Nagar"], [7, "Ambattur"],
    [8, "Anna Nagar"], [9, "Teynampet"], [10, "Kodambakkam"], [11, "Valasaravakkam"], [12, "Alandur"], [13, "Adyar"], [14, "Perungudi"],
    [15, "Sholinganallur"]
  ].map(([n, name]) => ({ n: n as number, name: name as string })),
  depts: [
    ["GCC-SWD", "Storm Water Drains"], ["DIST-DM", "District Disaster Management"], ["PWD-WRD", "PWD Water Resources"],
    ["GCC-ENG", "GCC Bus Route Roads"], ["POL-GCP", "Greater Chennai Police"], ["PWD-BLD", "PWD Buildings"], ["GCC-SWM", "Solid Waste Management"],
    ["GCC-HLT", "GCC Public Health"], ["GCC-ELE", "GCC Electrical"], ["HLT-DMS", "Directorate of Medical Services"],
    ["TNPCB", "Tamil Nadu Pollution Control Board"], ["GCC-PRK", "GCC Parks"], ["CMWSSB", "Metro Water (CMWSSB)"],
    ["GCC-GAD", "GCC General Administration"], ["GCC-REV", "GCC Revenue"]
  ].map(([code, name]) => ({ code, name })),
  cats: [
    ["FLOOD_WATERLOGGING", "Flooding & waterlogging"], ["FLOOD_RELIEF", "Flood relief needs"], ["WATERBODY_INFRA", "Lakes, bunds & sluices"],
    ["FLOOD_RISK_SIGNAL", "Weather & flood warnings"], ["DRAINAGE_SEWAGE", "Drainage & sewage"], ["ROAD_DAMAGE", "Roads, footpaths & bridges"],
    ["ROAD_ACCIDENT", "Road accident"], ["TRAFFIC_OBSTRUCTION", "Traffic obstruction & parking"], ["SOLID_WASTE", "Garbage & solid waste"],
    ["STREETLIGHT_ELECTRICAL", "Street lights & electrical hazards"], ["VECTOR_DISEASE", "Vector- & water-borne disease"],
    ["HEALTH_SERVICES", "Health services & hospital capacity"], ["AIR_POLLUTION", "Air pollution"], ["TREES_PARKS", "Trees, parks & playgrounds"],
    ["WATER_SUPPLY", "Drinking water supply"], ["FIRE_EXPLOSION", "Fire & explosion"], ["STRAY_ANIMALS", "Stray animals"],
    ["CRIME_PROPERTY", "Theft, snatching & fraud"], ["PUBLIC_ORDER", "Protests & public nuisance"]
  ].map(([code, label]) => ({ code, label })),
  taluks: [
    ["TLK-ALD", "Alandur", "ஆலந்தூர்"], ["TLK-AMB", "Ambattur", "அம்பத்தூர்"], ["TLK-EGM", "Egmore", "எழும்பூர்"], ["TLK-GND", "Guindy", "கிண்டி"],
    ["TLK-MDV", "Madhavaram", "மாதவரம்"], ["TLK-MBM", "Mambalam", "மாம்பலம்"], ["TLK-MYL", "Mylapore", "மயிலாப்பூர்"],
    ["TLK-PRB", "Perambur", "பெரம்பூர்"], ["TLK-SHN", "Sholinganallur", "சோழிங்கநல்லூர்"], ["TLK-TVT", "Thiruvottiyur", "திருவொற்றியூர்"],
    ["TLK-TDP", "Tondiarpet", "தண்டையார்பேட்டை"], ["TLK-VLC", "Velachery", "வேளச்சேரி"]
  ].map(([code, name, ta]) => ({ code, name, ta })),
  places: [
    { name: "T. Nagar", aliases: ["t nagar", "thyagaraya nagar", "தி.நகர்"], zone: null },
    { name: "Marina", aliases: ["marina beach", "marina"], zone: null }
  ],
  reservoirs: [{ id: "chembarambakkam", name: "Chembarambakkam" }, { id: "puzhal", name: "Puzhal" }, { id: "poondi", name: "Poondi" }],
  zoneRank: [13, 14, 10]
};

/** 29 Oct 2026, 09:00 in Chennai */
export const NOW = Date.parse("2026-10-29T09:00:00+05:30");

export const START: ScreenState = {
  page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones",
  panel: null, incident: null, list: ["INC-1", "INC-2", "INC-3"], lastFilter: null, lastPlace: null, now: NOW
};

export const withState = (s: Partial<ScreenState>): ScreenState => ({ ...START, ...s });
