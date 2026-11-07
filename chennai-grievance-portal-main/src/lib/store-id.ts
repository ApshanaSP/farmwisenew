/**
 * A row id as the store numbers it, read from a URL. One definition for every route that opens a row by number: a copy that does not
 * save to AWS numbers its own rows from LOCAL_IDS (lib/aws/store.ts, 1,000,000,000), which is ten digits, so a rule of "at most nine digits"
 * refused every row such a copy had saved (RC-24). The limit is the signed 32-bit integer the tables use, not a count of digits.
 */
export const STORE_ID_MAX = 2_147_483_647;
export function parseStoreId(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= STORE_ID_MAX ? n : null;
}
