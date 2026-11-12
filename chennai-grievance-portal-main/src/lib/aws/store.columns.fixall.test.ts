import { describe, expect, it } from "vitest";
import { addDurableColumns } from "./store";

// reviewer1-08: on the AWS store the website added petitions.recurrence (and users.token_version) with ALTER TABLE ... ADD COLUMN
// ... TEXT, while their migrations say INT NOT NULL DEFAULT 0: the count bound as a double was kept as the text "1.0", and old rows
// had NULL instead of 0. The columns now get the migration's type.
const sqliteDb = () => {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(m: string): { DatabaseSync: new (f: string) => any } }).getBuiltinModule("node:sqlite");
  return new DatabaseSync(":memory:");
};
const cols = (db: any, t: string) => new Set((db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all() as { name: string }[]).map((c) => c.name.toLowerCase()));

describe("reviewer1-08: the website's added columns have their migration's type", () => {
  it("petitions.recurrence: a number is stored as an integer, and a row from before the column has 0", () => {
    const db = sqliteDb();
    db.exec(`CREATE TABLE "petitions" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)`);
    db.prepare(`INSERT INTO petitions (name) VALUES ('old')`).run();
    addDurableColumns(db, "petitions", cols(db, "petitions"));
    db.prepare(`INSERT INTO petitions (name) VALUES ('new')`).run();
    db.prepare(`UPDATE petitions SET recurrence = ? WHERE name = 'new'`).run(1.0);
    const rows = db.prepare(`SELECT name, recurrence, typeof(recurrence) AS t FROM petitions ORDER BY id`).all();
    expect(rows).toEqual([{ name: "old", recurrence: 0, t: "integer" }, { name: "new", recurrence: 1, t: "integer" }]);
  });

  it("a row saved while the column was TEXT ('1.0') loads as the integer 1", () => {
    const db = sqliteDb();
    db.exec(`CREATE TABLE "petitions" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)`);
    addDurableColumns(db, "petitions", cols(db, "petitions"));
    db.prepare(`INSERT INTO petitions (name, recurrence) VALUES (?, ?)`).run("saved", "1.0");
    expect(db.prepare(`SELECT recurrence, typeof(recurrence) AS t FROM petitions`).get()).toEqual({ recurrence: 1, t: "integer" });
  });

  it("users.token_version is an integer too; sources.mapping stays text; a column already there is left alone", () => {
    const db = sqliteDb();
    db.exec(`CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "email" TEXT); CREATE TABLE "sources" ("id" INTEGER PRIMARY KEY, "mapping" TEXT)`);
    addDurableColumns(db, "users", cols(db, "users"));
    addDurableColumns(db, "sources", cols(db, "sources"));
    const type = (t: string, c: string) => (db.prepare(`SELECT type FROM pragma_table_info('${t}') WHERE name = ?`).get(c) as { type: string }).type;
    expect(type("users", "token_version")).toMatch(/^INTEGER/);
    expect(type("sources", "mapping")).toBe("TEXT");
  });
});
