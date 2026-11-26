/**
 * The departments as district_intel/reference/departments.yaml names them (those that own a follow-up), for the moment the store cannot be read
 * (26 Nov 2026: the connection dropped while the data loaded, the list came back empty, and every "police" and "metro water" filter was dropped
 * without a word). The store's own list is used whenever it can be read; knowndepts.test.ts keeps the two in step.
 */
export const KNOWN_DEPTS: readonly { code: string; name: string }[] = [
  { code: "GCC-SWD", name: "Storm Water Drain" },
  { code: "GCC-SWM", name: "Solid Waste Management" },
  { code: "GCC-ENG", name: "Roads & Building Permissions" },
  { code: "GCC-ELE", name: "Street Lighting & Electrical" },
  { code: "GCC-HLT", name: "Public Health (GCC)" },
  { code: "GCC-PRK", name: "Parks & Play Fields" },
  { code: "GCC-REV", name: "Revenue (Tax & Licence)" },
  { code: "GCC-GAD", name: "General Administration" },
  { code: "GCC-BRG", name: "Bridges" },
  { code: "GCC-EDU", name: "Education" },
  { code: "GCC-BLD", name: "Buildings (GCC)" },
  { code: "GCC-MEC", name: "Mechanical Engineering" },
  { code: "GCC-LND", name: "Land & Estate" },
  { code: "GCC-FMU", name: "Financial Management Unit" },
  { code: "GCC-CNL", name: "Council" },
  { code: "GCC-FWD", name: "Family Welfare" },
  { code: "POL-GCP", name: "Greater Chennai Police" },
  { code: "PWD-WRD", name: "PWD Water Resources" },
  { code: "PWD-BLD", name: "PWD Buildings" },
  { code: "HLT-DMS", name: "Government Hospitals" },
  { code: "CMWSSB", name: "Chennai Metrowater" },
  { code: "TANGEDCO", name: "Electricity Distribution" },
  { code: "TNPCB", name: "Pollution Control Board" },
  { code: "DIST-DM", name: "District Disaster Management" },
  { code: "DIST-REV", name: "District Revenue" }
];
