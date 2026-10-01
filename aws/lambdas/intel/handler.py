"""
fai-tce-team37-intel: the curated district_intel store on S3, for a PC and a website that hold no AWS keys.

The PC builds the store (district_intel, every 30 minutes) and the website reads it; neither may hold lasting AWS
keys (the team role cannot create IAM users), so both come through API Gateway with the x-refresh-key header and
get short-lived presigned S3 links from here.

  POST /intel/upload-urls  {"tables": {name: sha256}}  -> {name: presigned PUT url} for tables S3 does not have yet
  POST /intel/publish      manifest {"build_id", "exported_at", "tables": {name: {"sha", "rows", "bytes"}}}
                           -> checks every table object exists, then makes it the current build (one small write,
                              so readers switch from one complete build to the next, like the MySQL RENAME swap)
  POST /intel/snapshot     -> the current manifest, each table with a presigned GET url (valid 1 hour)

Objects are content-addressed (intel/tables/<name>/<sha256>.json.gz), so an unchanged table is never uploaded twice
and a reader can cache a table by its sha.
"""
from __future__ import annotations

import base64
import hmac
import json
import os
import re

import boto3
from botocore.config import Config

BUCKET = os.environ.get("RAW_BUCKET", "")
CURRENT = "intel/current.json"
NAME = re.compile(r"^[a-z0-9_]{1,64}$")
SHA = re.compile(r"^[0-9a-f]{64}$")
s3 = boto3.client("s3", config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))


def key(name: str, sha: str) -> str:
    return f"intel/tables/{name}/{sha}.json.gz"


def reply(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def exists(k: str) -> bool:
    try:
        s3.head_object(Bucket=BUCKET, Key=k)
        return True
    except s3.exceptions.ClientError:
        return False


def handler(event, context):
    given = (event.get("headers") or {}).get("x-refresh-key", "")
    if not given or not hmac.compare_digest(given.encode(), os.environ.get("REFRESH_KEY", "").encode()):
        return reply(401, {"error": "missing or wrong x-refresh-key"})
    path = event.get("rawPath", "")
    raw = event.get("body") or "{}"
    try:
        # API Gateway base64-encodes bodies whose content type it does not treat as text
        body = json.loads(base64.b64decode(raw) if event.get("isBase64Encoded") else raw)
    except ValueError:
        return reply(400, {"error": "body must be JSON"})

    if path == "/intel/upload-urls":
        tables = body.get("tables") or {}
        if not tables or not all(NAME.match(n) and SHA.match(str(h)) for n, h in tables.items()):
            return reply(400, {"error": "tables: {name: sha256 hex}"})
        urls = {n: s3.generate_presigned_url("put_object", ExpiresIn=900,
                                             Params={"Bucket": BUCKET, "Key": key(n, h), "ContentType": "application/gzip"})
                for n, h in tables.items() if not exists(key(n, h))}
        return reply(200, {"upload": urls, "already_there": sorted(set(tables) - set(urls))})

    if path == "/intel/publish":
        tables = body.get("tables") or {}
        if not body.get("build_id") or not tables or not all(NAME.match(n) and SHA.match(str(t.get("sha", "")))
                                                             for n, t in tables.items()):
            return reply(400, {"error": "manifest needs build_id and tables {name: {sha, rows, bytes}}"})
        missing = [n for n, t in tables.items() if not exists(key(n, t["sha"]))]
        if missing:
            return reply(409, {"error": "upload these tables first", "missing": missing})
        for n, t in tables.items():
            t["key"] = key(n, t["sha"])
        s3.put_object(Bucket=BUCKET, Key=CURRENT, Body=json.dumps(body).encode(), ContentType="application/json")
        return reply(200, {"published": body["build_id"], "tables": len(tables)})

    if path == "/intel/snapshot":
        try:
            manifest = json.loads(s3.get_object(Bucket=BUCKET, Key=CURRENT)["Body"].read())
        except s3.exceptions.NoSuchKey:
            return reply(404, {"error": "nothing published yet"})
        for t in manifest["tables"].values():
            t["url"] = s3.generate_presigned_url("get_object", ExpiresIn=3600, Params={"Bucket": BUCKET, "Key": t["key"]})
        return reply(200, manifest)

    return reply(404, {"error": f"no route {path}"})
