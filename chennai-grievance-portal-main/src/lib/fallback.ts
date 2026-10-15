/**
 * Deliberate fallbacks for optional data. Many panels read tables that only some stores have (a build from older
 * pipeline code, a MySQL server before a migration): those queries fall back to "nothing" quietly. Any other failure
 * (a typo in SQL, a lock, a closed connection) used to fall back just as quietly, and the console then showed "none"
 * where there was data. Now only a missing table or column is quiet; anything else is logged with where it happened.
 */

/** The table or column is not in this store (it is optional), as MySQL or the AWS store's SQLite reports it. */
export function missingSchema(e: unknown): boolean {
  const x = e as { code?: string; message?: string };
  return x?.code === "ER_NO_SUCH_TABLE" || x?.code === "ER_BAD_FIELD_ERROR"
    || /no such table|no such column|doesn't exist|Unknown column/i.test(String(x?.message ?? ""));
}

function report(what: string, e: unknown) {
  if (!missingSchema(e)) console.error(`[data] ${what} failed, showing nothing for it: ${(e as Error)?.message ?? e}`);
}

/** `.catch(orEmpty("where"))`: an empty list. */
export const orEmpty = (what: string) => (e: unknown): any[] => { report(what, e); return []; };
/** `.catch(orNull("where"))`: null. */
export const orNull = (what: string) => (e: unknown): null => { report(what, e); return null; };
