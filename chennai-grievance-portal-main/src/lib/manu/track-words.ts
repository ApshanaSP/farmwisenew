/**
 * The words /track shows for a status: the ones the citizen's tracker uses (StatusTracker), which the hand-checked Tamil list knows
 * (lib/i18n/ta.ts). /track showed the stored status as it is ("Completed - Pending Collector Verification"), which has no Tamil
 * (hunt2-desk-15). Safe to import from client components.
 */
const SHOWN: Record<string, string> = {
  "Completed - Pending Collector Verification": "Completed – pending Collector verification",
  "Resolved by Department": "Resolved – checked by the department"
};
export const shownStatus = (s: string): string => SHOWN[s] ?? s;
