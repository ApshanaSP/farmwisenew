"""
fai-tce-team37-store: the website's changing data (grievances, users, Collector decisions, workspaces, assistant
chats, ...) in DynamoDB, for a website that holds no AWS keys.

The website keeps a working copy in SQLite and writes every change here as it happens; DynamoDB is the truth.

  POST /store/load    -> {"rows": url, "reference": url}: presigned links to (1) every durable row, scanned from
                         DynamoDB in parallel into one gzipped JSON file, (2) the read-only reference tables
                         (streets, wards, complaint types ...) that the migration put in S3
  POST /store/write   {"put": [{"t": table, "k": key, "row": {...}}], "del": [{"t": table, "k": key}]}
                         -> writes them (body may be {"gz": base64(gzip(json))})

Item layout in fai-tce-team37-user:
  pk = row#<table>   sk = <key>   row = the row as JSON text (keeps types, empty strings and NULLs as they are)
  pk = schema        sk = <table> ddl = SQLite CREATE TABLE / INDEX / TRIGGER statements, key = key columns
"""
from __future__ import annotations

import base64
import gzip
import hmac
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config

BUCKET = os.environ.get("RAW_BUCKET", "")
TABLE = os.environ.get("USER_TABLE", "")
SEGMENTS = 8
s3 = boto3.client("s3", config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
ddb = boto3.client("dynamodb")


def reply(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def scan_segment(seg: int) -> list[dict]:
    out, kw = [], {"TableName": TABLE, "Segment": seg, "TotalSegments": SEGMENTS}
    while True:
        page = ddb.scan(**kw)
        out.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return out
        kw["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def load() -> dict:
    with ThreadPoolExecutor(SEGMENTS) as pool:
        items = [i for seg in pool.map(scan_segment, range(SEGMENTS)) for i in seg]
    schema, rows = {}, {}
    for i in items:
        pk, sk = i["pk"]["S"], i["sk"]["S"]
        if pk == "schema":
            schema[sk] = {"ddl": json.loads(i["ddl"]["S"]), "key": json.loads(i["key"]["S"])}
        elif pk.startswith("row#"):
            rows.setdefault(pk[4:], []).append(json.loads(i["row"]["S"]))
    key = f"store/load/{uuid.uuid4().hex}.json.gz"
    s3.put_object(Bucket=BUCKET, Key=key, ContentType="application/gzip",
                  Body=gzip.compress(json.dumps({"schema": schema, "rows": rows}, separators=(",", ":")).encode()))
    url = lambda k: s3.generate_presigned_url("get_object", ExpiresIn=900, Params={"Bucket": BUCKET, "Key": k})
    try:
        ref = json.loads(s3.get_object(Bucket=BUCKET, Key="store/reference.json")["Body"].read())
        ref_url = url(ref["key"])
    except s3.exceptions.NoSuchKey:
        ref_url = None
    return {"rows": url(key), "reference": ref_url, "tables": len(schema), "row_count": sum(map(len, rows.values()))}


def write(body: dict) -> dict:
    puts, dels = body.get("put") or [], body.get("del") or []
    t = boto3.resource("dynamodb").Table(TABLE)
    with t.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as w:
        for p in puts:
            w.put_item(Item={"pk": f"row#{p['t']}", "sk": str(p["k"]), "row": json.dumps(p["row"], separators=(",", ":"))})
        for d in dels:
            w.delete_item(Key={"pk": f"row#{d['t']}", "sk": str(d["k"])})
        for name, s in (body.get("schema") or {}).items():
            w.put_item(Item={"pk": "schema", "sk": name, "ddl": json.dumps(s["ddl"]), "key": json.dumps(s["key"])})
    return {"put": len(puts), "del": len(dels)}


def handler(event, context):
    given = (event.get("headers") or {}).get("x-refresh-key", "")
    if not given or not hmac.compare_digest(given.encode(), os.environ.get("REFRESH_KEY", "").encode()):
        return reply(401, {"error": "missing or wrong x-refresh-key"})
    raw = event.get("body") or "{}"
    try:
        body = json.loads(base64.b64decode(raw) if event.get("isBase64Encoded") else raw)
        if "gz" in body:
            body = json.loads(gzip.decompress(base64.b64decode(body["gz"])))
    except (ValueError, OSError) as e:
        return reply(400, {"error": f"bad body: {e}"})
    path = event.get("rawPath", "")
    if path == "/store/load":
        return reply(200, load())
    if path == "/store/write":
        return reply(200, write(body))
    return reply(404, {"error": f"no route {path}"})
