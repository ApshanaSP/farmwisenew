import { describe, expect, it } from "vitest";
import { reportKind, type ReportKind } from "./reporttype";

// Real headlines the console listed as incidents between 22 and 26 Oct 2026 (LT-03), and what each one is.
const CASES: [string, ReportKind | null][] = [
  // forecasts and warnings
  ["'Yellow' alert for Chennai today", "alert"],
  ["Rain to continue in Chennai and 30 districts for the next 2 hours!", "alert"],
  ["How will the rain be in Chennai today? In other districts..?", "alert"],
  ["Don’t go to Kovil and Nilagiri… Chennai Weather Research Centre gives a warning!", "alert"],
  ["Rain Alert: Heavy rains lashed; Rain alert for 26 districts; What is the situation in Chennai?", "alert"],
  ["Arnab Cyclone warning: No direct impact on Chennai - Meteorological Department information!", "alert"],
  ["Where and when will Cyclone Arnab cross the coast? Will it hit Chennai?", "alert"],
  ["Cyclone forming in the Bay of Bengal: Red alert for 3 districts today - How will the rain be in Chennai?", "alert"],
  // government work
  ["43 tonnes of items including tires and plastics that cause mosquito breeding removed in Chennai", "government_action"],
  ["Dengue prevention measure: 35 thousand kg of waste materials removed in Chennai", "government_action"],
  ["17 low-lying areas in Chennai vulnerable, 113 boats ready, says GCC chief", "government_action"],
  ["₹80-crore stormwater drain to ease flooding in Korattur", "government_action"],
  ["Chennai Corporation starts inspection of dilapidated buildings to prevent collapse this Northeast Monsoon", "government_action"],
  ["980 fire personnel on standby to face monsoon in Chennai", "government_action"],
  ["More boats for flood-prone areas this monsoon season in Chennai", "government_action"],
  ["Chennai vaccinates over 1.5 lakh stray dogs against rabies", "government_action"],
  ["3 new projects to reduce traffic congestion in Chennai: Tender called to prepare Detailed Project Report", "government_action"],
  ["Intense rainwater removal work in Manali zone using 200 workers, giant motors; special officers inspect...!", "government_action"],
  // rescues and endings
  ["Ambattur Missing Boys | 5 boys missing near Ambattur rescued near Guntur", "resolution"],
  ["People in the car rescued safely! | Chennai Rain | Heavy Rain | Tambaram", "resolution"],
  ["Krishnagiri boy who went missing rescued from Chennai in 24 hrs", "resolution"],
  ["MTC bus driver gets 4.5-year jail for double fatal incident", "resolution"],
  // roundups and status tables
  ["Chennai Latest News Today on October 26th, 2026: Cyclone Arnab, Heavy Rains & Water Levels Rise", "roundup"],
  ["Chennai Latest News Today on October 24th, 2026: Monsoon Vigil, Power Outages & Electoral Protests", "roundup"],
  ["Crime Corner: Chennai", "roundup"],
  // a minister's season tally is statistics, not a death in Chennai today (R-04, 26–27 Oct 2026)
  ["14 deaths due to monsoon so far.... Minister Sengottaiyan information regarding rain damage", "roundup"],
  ["14 deaths so far due to monsoon.... Minister Sengottaiyan information regarding rain damage", "roundup"],
  ["Death toll in Ennore gas leak rises to 3 so far", "incident"],
  ["2 dead so far as building collapses in Chennai during monsoon", "incident"],
  ["Current water storage status of Chennai's major lakes: A detailed look!", "roundup"],
  ["Deep Dive| Scary rain, floods.. Are you from this area in Chennai? You must be cautious", "roundup"],
  // opinion, features, politics
  ["What is the reason for traffic congestion in Chennai? Public opinion – VOX POP", "opinion"],
  ["'Growing buildings, shrinking water bodies' - Why does flooding happen often in Chennai? Information in new study", "opinion"],
  ["Will the cyclone come to Chennai? Debate Arnab-style! - Viral meme news", "opinion"],
  ["Increased dengue spread in Chennai due to Tewag’s sluggish response: Mayor Priya accuses!", "opinion"],
  ["\"Flooded even for one day of rain...\" Anbumani Ramadoss insists on immediate removal of Pallikaranai marshland wall!", "opinion"],
  ["Ready to respond to criticism; action will definitely be taken if spoken vulgarly: Minister Ramesh warns", "opinion"],
  ["Chennai floating in flood waters.! Marshland encroachment.? Rainwater drain irregularity.? Velmurugan asks barrage of questions", "opinion"],
  ["Vandalur Zoo temporarily closed: What are the alternative places to visit in Chennai?", "opinion"],
  ["A 1999 accident left her struggling to walk and unsure how to rebuild her life; years later, Chennai activists help", "opinion"],
  // promotions and events
  ["MISSO robotic technology with artificial intelligence for knee joint replacement surgery at Chennai Shivam Ortho Hospital", "other"],
  ["Chennai MIOT Hospital | World Trauma Day awareness event at Chennai MIOT Hospital", "other"],
  // real incidents stay incidents
  ["Chennai: Woman dies after pushed to floor while rescuing son", "incident"],
  ["Class 12 student killed and four injured in accident on Tambaram-Maduravoyal bypass", "incident"],
  ["Nepali man stabbed by roommate in Perungudi", "incident"],
  ["Chennai bus-motorcycle collision injures three teens, driver assaulted", "incident"],
  ["Rainwater stagnation troubles residents of Kodambakkam, Nungambakkam", "incident"],
  ["Thousands stranded as signal panel fault disrupts train services", "incident"],
  ["Boats stranded at Chennai Kasimedu fishing harbor due to storm", "incident"],
  ["Former DMK Minister Anbil Mahesh Poyyamozhi arrested in ₹100-crore private schools fraud case", "incident"],
  ["Chennai police arrest three for meth possession in Virugambakkam", "incident"],
  ["Large fire at a factory near Chennai – thick black smoke surrounds | Fire Accident | Chennai", "incident"],
  ["104 trees uprooted and fell in the rain that lashed Chennai", "incident"],
  ["Chennai: Two jailbreaks at Puzhal prison within 24 hours", "incident"],
  ["Chennai roads turn into potholes due to continuous rain", "incident"],
  ["Couple found dead at Ambattur home", "incident"],
  ["Car plunges into canal - 5 people from Chennai escape safely", "incident"],
  ["Residents flag safety risk as silt removed from canals piles up along city roads", "incident"],
  ["Water inflow decreases into Chennai drinking water reservoirs", "roundup"],
  ["Water level in 5 lakes supplying drinking water to Chennai city rises by 1 TMC in 10 days", "roundup"],
  // routed to officers as complaints on 27 Oct, before the on-load corrections ran
  ["Water level in Pondicherry Lake, which supplies drinking water to Chennai, has decreased", "roundup"],
  ["Nine days of rain add 28 days of drinking water to Chennai’s reserves", "roundup"],
  ["Chennai Sewage Cleanup Covers 227 Streets Ahead of Rain", "government_action"],
  ["Chennai Rain|Sengottaiyan |\"Rainwater drainage works were not completed in the last 5 years\" Minister KAS", "opinion"],
  ["On behalf of Chennai Municipal Administration and Water Supply Department at Chennai Chepauk Tamil Nadu Water Supply and Drainage Board headquarters", "other"],
  ["Unsold vegetables pile up at Koyambedu market as festival trade slows", "other"],
  ["Amma Drinking Water Treatment Plants lying defunct in Chennai: TTV Dhinakaran condemns TVK government!", "opinion"],
  // real complaints stay
  ["Tambaram-Velachery Road in Chennai riddled with potholes; ambulance overturns, two injured", "incident"],
  ["Potholes, chaotic turns snarl key link road in Zamin Royapettah", "incident"],
  ["Will the Northeast monsoon help? Water stock low in Chennai's drinking water lakes!", "roundup"],
  ["Chennai Metrowater Clears 227 Streets, Boosts Sewage Response", "government_action"],
  ["Chennai sewerage board clears lines in 227 streets in a day", "government_action"],
  ["Anti-rabies vaccine administered to 1.50 lakh stray dogs: Chennai Corporation information", "government_action"]
];

describe("report kind from the headline (LT-03)", () => {
  for (const [title, want] of CASES) it(`${want}: ${title.slice(0, 70)}`, () => expect(reportKind(title)).toBe(want));
});
