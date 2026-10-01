"""
One-time move of the website's own MySQL data to AWS (run while MySQL still holds it; safe to re-run).

  district_intel_ops (all tables) and the portal tables the website writes (users, user_profiles, password_resets,
  complaints, complaint_status_history)  ->  DynamoDB fai-tce-team37-user, one item per row
  the other portal tables (streets, wards, localities, complaint types ...: reference data the website only reads)
                                         ->  one gzipped snapshot in S3 (store/reference/<sha>.json.gz)

Each table's SQLite schema is generated from MySQL's own information_schema (column types, NOT NULL, defaults,
AUTO_INCREMENT, primary / unique / plain indexes, ON UPDATE CURRENT_TIMESTAMP as a trigger) and stored with it,
so the website rebuilds exactly these tables. Times are IST wall-clock strings, as the website reads them today.

    npm run ai:key   (fresh AWS keys, in chennai-grievance-portal-main)
    python aws/migrate_mysql.py            dry run: what would move
    python aws/migrate_mysql.py --write    move it
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import decimal
import gzip
import hashlib
import json
import os
import sys

from common import BUCKETS, ROOT, TABLES, session  # first: sets up truststore

import pymysql  # noqa: E402

PORTAL_WRITTEN = {"users", "user_profiles", "password_resets", "complaints", "complaint_status_history"}
NOW = "(datetime('now', '+330 minutes'))"  # MySQL's CURRENT_TIMESTAMP on a server running on IST


def connect(database: str | None = None):
    return pymysql.connect(host=os.environ.get("DB_HOST", "localhost"), port=int(os.environ.get("DB_PORT") or 3306),
                           user=os.environ.get("DB_USER", "root"), password=os.environ.get("DB_PASSWORD", ""),
                           database=database, charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)


def sql_type(c: dict) -> str:
    t = c["DATA_TYPE"].lower()
    if t in ("int", "integer", "bigint", "tinyint", "smallint", "mediumint", "bit", "year"):
        return "INTEGER"
    if t in ("decimal", "float", "double", "real", "numeric"):
        return "REAL"
    if t in ("blob", "longblob", "mediumblob", "tinyblob", "binary", "varbinary"):
        return "BLOB"
    if t in ("datetime", "timestamp", "date", "time", "json"):
        return "TEXT"
    return "TEXT COLLATE NOCASE"  # MySQL's default collations compare text case-insensitively


def default(c: dict) -> str:
    d, extra = c["COLUMN_DEFAULT"], (c["EXTRA"] or "").lower()
    if d is None or str(d).upper() == "NULL":
        return ""
    if str(d).upper().startswith("CURRENT_TIMESTAMP") or str(d).lower().startswith("now("):
        return f" DEFAULT {NOW}"
    if "default_generated" in extra:  # an expression default, e.g. (uuid()) or (json_array())
        expr = str(d).strip("()")
        if expr.lower() in ("json_array", "json_array()"):
            return " DEFAULT '[]'"
        if expr.lower() in ("json_object", "json_object()"):
            return " DEFAULT '{}'"
        print(f"    note: {c['TABLE_NAME']}.{c['COLUMN_NAME']} default {d} has no SQLite equivalent; left out")
        return ""
    if sql_type(c) in ("INTEGER", "REAL"):
        return f" DEFAULT {d}"
    return " DEFAULT '" + str(d).replace("'", "''") + "'"


def schema(cur, db: str, table: str) -> dict:
    cur.execute("""SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s
                   ORDER BY ORDINAL_POSITION""", (db, table))
    cols = cur.fetchall()
    cur.execute("""SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s ORDER BY INDEX_NAME, SEQ_IN_INDEX""", (db, table))
    idx: dict[str, dict] = {}
    for r in cur.fetchall():
        i = idx.setdefault(r["INDEX_NAME"], {"unique": not r["NON_UNIQUE"], "cols": [], "type": r["INDEX_TYPE"]})
        i["cols"].append(r["COLUMN_NAME"])
    pk = idx.pop("PRIMARY", {"cols": []})["cols"]
    auto = [c["COLUMN_NAME"] for c in cols if "auto_increment" in (c["EXTRA"] or "").lower()]
    q = lambda s: '"' + s.replace('"', '""') + '"'
    lines = []
    for c in cols:
        name = c["COLUMN_NAME"]
        if pk == [name] and name in auto:
            lines.append(f"{q(name)} INTEGER PRIMARY KEY AUTOINCREMENT")
            continue
        nn = " NOT NULL" if c["IS_NULLABLE"] == "NO" else ""
        lines.append(f"{q(name)} {sql_type(c)}{nn}{default(c)}")
    if pk and not (pk == auto[:1] and len(pk) == 1):
        lines.append(f"PRIMARY KEY ({', '.join(map(q, pk))})")
    ddl = [f"CREATE TABLE {q(table)} ({', '.join(lines)})"]
    for name, i in idx.items():
        if i["type"] == "FULLTEXT":
            print(f"    note: {table}.{name} is a FULLTEXT index; SQLite has none (LIKE still works)")
            continue
        ddl.append(f"CREATE {'UNIQUE ' if i['unique'] else ''}INDEX {q(f'{table}__{name}')} ON {q(table)} ({', '.join(map(q, i['cols']))})")
    for c in cols:  # ON UPDATE CURRENT_TIMESTAMP
        if "on update current_timestamp" in (c["EXTRA"] or "").lower():
            n = c["COLUMN_NAME"]
            ddl.append(f"CREATE TRIGGER {q(f'{table}__touch_{n}')} AFTER UPDATE ON {q(table)} FOR EACH ROW "
                       f"WHEN NEW.{q(n)} IS OLD.{q(n)} BEGIN UPDATE {q(table)} SET {q(n)} = {NOW} WHERE rowid = NEW.rowid; END")
    key = pk or next((i["cols"] for i in idx.values() if i["unique"]), None) or ["rowid"]
    return {"ddl": ddl, "key": key, "columns": [c["COLUMN_NAME"] for c in cols]}


def value(v):
    if isinstance(v, dt.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, dt.date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dt.timedelta):
        s = int(v.total_seconds())
        return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray)):
        return {"$b64": base64.b64encode(bytes(v)).decode()}
    return v


def rows(cur, table: str, sch: dict) -> list[dict]:
    cur.execute(f"SELECT * FROM `{table}`")
    out = [{k: value(v) for k, v in r.items()} for r in cur.fetchall()]
    if sch["key"] == ["rowid"]:
        for n, r in enumerate(out, 1):
            r["rowid"] = n
    return out


def keystr(r: dict, key: list[str]) -> str:
    return json.dumps([r.get(k) for k in key], ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write to AWS (default: dry run)")
    a = ap.parse_args()
    sess = session()  # loads chennai-grievance-portal-main/.env (MySQL and AWS keys)
    ops_db = os.environ.get("INTEL_OPS_DB_NAME", "district_intel_ops")
    portal_db = os.environ.get("DB_NAME", "district_collector_dashboard")
    con = connect()
    cur = con.cursor()
    durable, reference = {}, {}
    for db in (ops_db, portal_db):
        cur.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_TYPE='BASE TABLE' ORDER BY 1", (db,))
        for (t,) in [tuple(r.values()) for r in cur.fetchall()]:
            sch = schema(cur, db, t)
            cur.execute(f"USE `{db}`")
            data = rows(cur, t, sch)
            target = durable if (db == ops_db or t in PORTAL_WRITTEN) else reference
            target[t] = (sch, data)
            print(f"  {'dynamodb' if target is durable else 'reference':<9} {db}.{t}: {len(data)} rows, key {sch['key']}")
    con.close()
    n_items = sum(len(d) for _, d in durable.values())
    ref_doc = {"schema": {t: {"ddl": s["ddl"], "key": s["key"]} for t, (s, _) in reference.items()},
               "rows": {t: d for t, (_, d) in reference.items()}}
    ref_gz = gzip.compress(json.dumps(ref_doc, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0)
    print(f"\nDynamoDB: {len(durable)} tables, {n_items} rows | reference snapshot: {len(reference)} tables, "
          f"{sum(len(d) for _, d in reference.values())} rows, {len(ref_gz) / 1e6:.1f} MB gzipped")
    if not a.write:
        print("dry run: nothing written (add --write)")
        return 0

    table = sess.resource("dynamodb").Table(TABLES["user"])
    with table.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as w:
        for t, (sch, data) in durable.items():
            w.put_item(Item={"pk": "schema", "sk": t, "ddl": json.dumps(sch["ddl"]), "key": json.dumps(sch["key"])})
            for r in data:
                w.put_item(Item={"pk": f"row#{t}", "sk": keystr(r, sch["key"]),
                                 "row": json.dumps(r, ensure_ascii=False, separators=(",", ":"))})
    print(f"DynamoDB {TABLES['user']}: {len(durable)} schemas, {n_items} rows written")
    s3 = sess.client("s3")
    key = f"store/reference/{hashlib.sha256(ref_gz).hexdigest()}.json.gz"
    s3.put_object(Bucket=BUCKETS["raw"], Key=key, Body=ref_gz, ContentType="application/gzip")
    s3.put_object(Bucket=BUCKETS["raw"], Key="store/reference.json", ContentType="application/json",
                  Body=json.dumps({"key": key, "tables": sorted(reference), "migrated_at": dt.datetime.now().isoformat(" ", "seconds")}).encode())
    print(f"S3 s3://{BUCKETS['raw']}/{key}: reference snapshot written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
