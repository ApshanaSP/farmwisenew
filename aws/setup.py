"""
Creates (or updates) team 37's AWS resources. Safe to re-run: anything that already exists is left as it is,
and the Lambdas' code is replaced with the current version.

    pip install -r aws/requirements.txt
    npm run ai:key                         (in chennai-grievance-portal-main, with fresh keys)
    python aws/setup.py                    create everything, deploy the collector Lambdas and their API routes
    python aws/setup.py --invoke           ... then run every collector Lambda once and print the results
    python aws/setup.py --only cpcb pwd    deploy (and with --invoke, run) just these collectors

Rules from the FarmwiseAI guide: Mumbai only, fai-tce-team37-* names, private buckets, the existing
FAI-TCE-LambdaExecutionRole (no new IAM roles).
"""
from __future__ import annotations

import argparse
import io
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from common import BUCKETS, COLLECTORS, LAMBDA_ROLE, REGION, ROOT, STREAM_TABLES, TABLES, TEAM, session  # first: sets up truststore

from botocore.config import Config  # noqa: E402  (imported after truststore is in place, or TLS setup recurses)
from botocore.exceptions import ClientError  # noqa: E402

TAGS = [{"Key": "team", "Value": TEAM}, {"Key": "project", "Value": "district-intel"}]
HOURLY_RULE = f"{TEAM}-hourly"
API_NAME = f"{TEAM}-api"
ENV = ROOT / "chennai-grievance-portal-main" / ".env"
PACKAGE = f"{TEAM}-collect"
BACKGROUND = {"news"}  # must match BACKGROUND in lambdas/collect/handler.py
INTEL_FN = f"{TEAM}-intel"
STORE_FN = f"{TEAM}-store"
EXTRA_FILES = [ROOT / "aws" / "lambdas" / "collect" / "handler.py",
               ROOT / "chennai-grievance-portal-main" / "data" / "boundaries" / "gcc-wards.geojson",
               ROOT / "police_dataset_generator" / "config" / "taluks.json"]
PIP = ["requests", "beautifulsoup4", "lxml", "pandas", "tzdata",
       "feedparser", "trafilatura", "PyYAML", "python-dotenv", "python-dateutil"]  # the last five: news pipeline
NEWS = ROOT / "chennai_news_pipeline"
# state a source starts from on first deploy, when it is not simply the CSVs in its COLLECTORS folder
SEED_FILES = {"news": [NEWS / "data" / "processed" / "master_news.csv", NEWS / "data" / "state" / "pipeline_state.json"]}

s = session()
s3, ddb, events, gw = (s.client(n) for n in ("s3", "dynamodb", "events", "apigatewayv2"))
# a news run takes ~10 min; never retry an invoke (a retry would start a second run)
lam = s.client("lambda", config=Config(read_timeout=910, retries={"max_attempts": 1}))
account = s.client("sts").get_caller_identity()["Account"]


def fn_name(source: str) -> str:
    return f"{TEAM}-collect-{source}"


def say(what: str, status: str) -> None:
    print(f"  {status:<9} {what}")


def make_buckets() -> None:
    have = {b["Name"] for b in s3.list_buckets()["Buckets"]}
    for name in BUCKETS.values():
        if name in have:
            say(f"s3://{name}", "exists")
            continue
        # New buckets are private (Block Public Access on) and encrypted (SSE-S3) by AWS default; the Builder role
        # may neither read nor change those settings, so they are left at the default.
        s3.create_bucket(Bucket=name, CreateBucketConfiguration={"LocationConstraint": REGION})
        try:
            s3.put_bucket_tagging(Bucket=name, Tagging={"TagSet": TAGS})
        except ClientError:
            pass  # tags are a nicety
        say(f"s3://{name} (private by default)", "created")


def make_tables() -> None:
    have = set(ddb.list_tables()["TableNames"])
    for key, name in TABLES.items():
        if name in have:
            say(f"DynamoDB {name}", "exists")
            continue
        extra = {"StreamSpecification": {"StreamEnabled": True, "StreamViewType": "NEW_IMAGE"}} if key in STREAM_TABLES else {}
        ddb.create_table(TableName=name, BillingMode="PAY_PER_REQUEST", Tags=TAGS,
                         AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                                               {"AttributeName": "sk", "AttributeType": "S"}],
                         KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
                         **extra)
        say(f"DynamoDB {name} (on-demand{', stream on' if extra else ''})", "created")
    for name in TABLES.values():
        ddb.get_waiter("table_exists").wait(TableName=name)
    # dynamodb:UpdateTable is denied to the Builder role, so indexes can only be added when a table is created


def seed_state(source: str) -> None:
    """First deploy only: start the Lambda from the CSVs the local collector has built up, not from nothing."""
    if s3.list_objects_v2(Bucket=BUCKETS["raw"], Prefix=f"state/{source}/").get("KeyCount"):
        return
    files = [f for f in SEED_FILES.get(source, []) if f.exists()] or list(COLLECTORS[source][1].glob("*.csv"))
    for f in files:
        s3.upload_file(str(f), BUCKETS["raw"], f"state/{source}/{f.name}")
    say(f"{source} state in S3: {', '.join(f.name for f in files)}", "seeded")


def build_zip() -> bytes:
    # pandas is bundled: the Builder role may not use AWS's shared pandas layer (GetLayerVersion is denied)
    with tempfile.TemporaryDirectory() as tmp:
        pkg = Path(tmp)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--target", str(pkg),
                        "--platform", "manylinux2014_x86_64", "--python-version", "3.12", "--only-binary=:all:", *PIP],
                       check=True)
        # langdetect ships only as a source package (pure Python), so it is installed on its own
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--target", str(pkg), "--no-deps", "langdetect"],
                       check=True)
        for junk in pkg.glob("*/tests"):
            shutil.rmtree(junk, ignore_errors=True)
        for f in [c[0] for c in COLLECTORS.values() if c[0]] + EXTRA_FILES + [NEWS / "config.yaml"]:
            shutil.copy(f, pkg)
        shutil.copytree(NEWS / "src", pkg / "src", ignore=shutil.ignore_patterns("__pycache__"))  # news pipeline code
        shutil.copytree(ROOT / "aws" / "lambdas" / "collect" / "shims", pkg, dirs_exist_ok=True)  # Playwright stand-in
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for f in pkg.rglob("*"):
                if f.is_file() and "__pycache__" not in f.parts:
                    z.write(f, f.relative_to(pkg).as_posix())
        return buf.getvalue()


def upload_package() -> dict:
    code = build_zip()
    key = f"deploy/{PACKAGE}.zip"  # zips over ~50 MB must go through S3
    s3.put_object(Bucket=BUCKETS["raw"], Key=key, Body=code)
    say(f"package s3://{BUCKETS['raw']}/{key} ({len(code) // 1024} KB)", "uploaded")
    return {"S3Bucket": BUCKETS["raw"], "S3Key": key}


def deploy(source: str, src: dict) -> str:
    name = fn_name(source)
    cfg = dict(Runtime="python3.12", Handler="handler.handler", Timeout=900, MemorySize=1024,
               EphemeralStorage={"Size": 2048},  # /tmp: news keeps a ~50 MB master file plus the day's raw pages
               Description=f"{COLLECTORS[source][2]} -> S3 + DynamoDB",
               Environment={"Variables": {"SOURCE": source, "RAW_BUCKET": BUCKETS["raw"], "INTEL_TABLE": TABLES["intel"],
                                          "BACKFILL_DAYS": "3", "REFRESH_KEY": refresh_key(),
                                          # CPCB's browser-free source; free key from data.gov.in, if you have one
                                          "DATA_GOV_IN_API_KEY": os.environ.get("DATA_GOV_IN_API_KEY", "")}})
    try:
        lam.get_function(FunctionName=name)
        lam.update_function_code(FunctionName=name, **src)
        lam.get_waiter("function_updated_v2").wait(FunctionName=name)
        lam.update_function_configuration(FunctionName=name, **cfg)
        status = "updated"
    except lam.exceptions.ResourceNotFoundException:
        lam.create_function(FunctionName=name, Role=f"arn:aws:iam::{account}:role/{LAMBDA_ROLE}", Code=src,
                            Tags={t["Key"]: t["Value"] for t in TAGS}, **cfg)
        status = "created"
    lam.get_waiter("function_active_v2").wait(FunctionName=name)
    lam.get_waiter("function_updated_v2").wait(FunctionName=name)
    if source in BACKGROUND:
        # /refresh/news re-invokes the function in the background. The shared execution role has no
        # lambda:InvokeFunction, so the function's own resource policy grants it (same account, so either works).
        try:
            lam.add_permission(FunctionName=name, StatementId="self-invoke-background", Action="lambda:InvokeFunction",
                               Principal=f"arn:aws:iam::{account}:role/{LAMBDA_ROLE}")
        except lam.exceptions.ResourceConflictException:
            pass  # already there
    say(f"Lambda {name}", status)
    return lam.get_function(FunctionName=name)["Configuration"]["FunctionArn"]


def schedule_hourly(source: str, fn_arn: str) -> None:
    rule = events.put_rule(Name=HOURLY_RULE, ScheduleExpression="rate(1 hour)", State="ENABLED",
                           Description="Runs the team 37 collectors every hour")  # events:TagResource is denied
    try:
        lam.add_permission(FunctionName=fn_name(source), StatementId=f"{HOURLY_RULE}-invoke", Action="lambda:InvokeFunction",
                           Principal="events.amazonaws.com", SourceArn=rule["RuleArn"])
    except lam.exceptions.ResourceConflictException:
        pass  # permission already there
    events.put_targets(Rule=HOURLY_RULE, Targets=[{"Id": f"collect-{source}", "Arn": fn_arn}])
    say(f"EventBridge {HOURLY_RULE} -> {fn_name(source)} (every hour)", "ready")


def refresh_key() -> str:
    """The secret an outside cron sends as x-refresh-key. Made once and kept in the portal's .env (gitignored)."""
    key = os.environ.get("REFRESH_API_KEY", "").strip()
    if not key:
        key = secrets.token_urlsafe(32)
        with ENV.open("a", encoding="utf-8") as f:
            f.write(f"\nREFRESH_API_KEY={key}\n")
        os.environ["REFRESH_API_KEY"] = key
        say("REFRESH_API_KEY (saved to chennai-grievance-portal-main/.env)", "created")
    return key


def api() -> dict:
    """The team's HTTP API, throttled so a leaked URL cannot run up the bill."""
    a = next((x for x in gw.get_apis()["Items"] if x["Name"] == API_NAME), None)
    if a is None:
        a = gw.create_api(Name=API_NAME, ProtocolType="HTTP", Description="team 37 district intel API")
        say(f"API Gateway {API_NAME}", "created")
    throttle = {"ThrottlingBurstLimit": 5, "ThrottlingRateLimit": 1.0}
    if not any(st["StageName"] == "$default" for st in gw.get_stages(ApiId=a["ApiId"])["Items"]):
        gw.create_stage(ApiId=a["ApiId"], StageName="$default", AutoDeploy=True, DefaultRouteSettings=throttle)
    return a


def add_route(a: dict, source: str, fn_arn: str) -> None:
    """POST /refresh/<source> and /ingest/<source> -> that collector's Lambda (it checks x-refresh-key itself)."""
    api_id = a["ApiId"]
    integ = next((i for i in gw.get_integrations(ApiId=api_id)["Items"] if i.get("IntegrationUri") == fn_arn), None)
    if integ is None:
        integ = gw.create_integration(ApiId=api_id, IntegrationType="AWS_PROXY", IntegrationUri=fn_arn,
                                      PayloadFormatVersion="2.0", TimeoutInMillis=30000)
    have = {r["RouteKey"] for r in gw.get_routes(ApiId=api_id)["Items"]}
    for path in (f"/refresh/{source}", f"/ingest/{source}"):
        if f"POST {path}" not in have:
            gw.create_route(ApiId=api_id, RouteKey=f"POST {path}", Target=f"integrations/{integ['IntegrationId']}")
        say(f"POST {a['ApiEndpoint']}{path}", "route")
    try:
        lam.add_permission(FunctionName=fn_name(source), StatementId=f"{API_NAME}-invoke-any", Action="lambda:InvokeFunction",
                           Principal="apigateway.amazonaws.com",
                           SourceArn=f"arn:aws:execute-api:{REGION}:{account}:{api_id}/*/*/*/{source}")
    except lam.exceptions.ResourceConflictException:
        pass  # permission already there


def deploy_intel(a: dict) -> None:
    """fai-tce-team37-intel: presigned S3 links for the curated store (PC uploads, website reads), 3 routes."""
    deploy_small(a, INTEL_FN, "intel", ["/intel/upload-urls", "/intel/publish", "/intel/snapshot"], "intel",
                 "Curated district_intel store on S3: presigned upload / publish / snapshot links", 256)


def deploy_store(a: dict) -> None:
    """fai-tce-team37-store: the website's changing data in DynamoDB (load snapshot, write changes), 2 routes."""
    deploy_small(a, STORE_FN, "store", ["/store/load", "/store/write"], "store",
                 "Website data in DynamoDB: startup snapshot and change writes", 1024)


def deploy_small(a: dict, name: str, folder: str, paths: list[str], prefix: str, description: str, memory: int) -> None:
    """A one-file Lambda (boto3 only) behind API Gateway routes POST <paths>."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(ROOT / "aws" / "lambdas" / folder / "handler.py", "handler.py")
    cfg = dict(Runtime="python3.12", Handler="handler.handler", Timeout=30, MemorySize=memory, Description=description,
               Environment={"Variables": {"RAW_BUCKET": BUCKETS["raw"], "USER_TABLE": TABLES["user"],
                                          "REFRESH_KEY": refresh_key()}})
    try:
        lam.get_function(FunctionName=name)
        lam.update_function_code(FunctionName=name, ZipFile=buf.getvalue())
        lam.get_waiter("function_updated_v2").wait(FunctionName=name)
        lam.update_function_configuration(FunctionName=name, **cfg)
        status = "updated"
    except lam.exceptions.ResourceNotFoundException:
        lam.create_function(FunctionName=name, Role=f"arn:aws:iam::{account}:role/{LAMBDA_ROLE}",
                            Code={"ZipFile": buf.getvalue()}, Tags={t["Key"]: t["Value"] for t in TAGS}, **cfg)
        status = "created"
    lam.get_waiter("function_active_v2").wait(FunctionName=name)
    lam.get_waiter("function_updated_v2").wait(FunctionName=name)
    say(f"Lambda {name}", status)
    arn = lam.get_function(FunctionName=name)["Configuration"]["FunctionArn"]
    api_id = a["ApiId"]
    integ = next((i for i in gw.get_integrations(ApiId=api_id)["Items"] if i.get("IntegrationUri") == arn), None)
    if integ is None:
        integ = gw.create_integration(ApiId=api_id, IntegrationType="AWS_PROXY", IntegrationUri=arn,
                                      PayloadFormatVersion="2.0", TimeoutInMillis=30000)
    have = {r["RouteKey"] for r in gw.get_routes(ApiId=api_id)["Items"]}
    for path in paths:
        if f"POST {path}" not in have:
            gw.create_route(ApiId=api_id, RouteKey=f"POST {path}", Target=f"integrations/{integ['IntegrationId']}")
        say(f"POST {a['ApiEndpoint']}{path}", "route")
    try:
        lam.add_permission(FunctionName=name, StatementId=f"{API_NAME}-invoke", Action="lambda:InvokeFunction",
                           Principal="apigateway.amazonaws.com",
                           SourceArn=f"arn:aws:execute-api:{REGION}:{account}:{api_id}/*/*/{prefix}/*")
    except lam.exceptions.ResourceConflictException:
        pass  # permission already there


def invoke(source: str, full: bool) -> None:
    r = lam.invoke(FunctionName=fn_name(source), Payload=json.dumps({"full": full}).encode())
    body = r["Payload"].read().decode()
    say(body[:600], "ERROR" if r.get("FunctionError") else "ran")


def step(what: str, fn, *a):
    try:
        return fn(*a)
    except ClientError as e:
        say(f"{what}: {e.response['Error']['Code']}: {e.response['Error']['Message'][:200]}", "FAILED")
        return None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="+", choices=list(COLLECTORS), help="just these collectors")
    ap.add_argument("--invoke", action="store_true", help="run each deployed collector Lambda once")
    ap.add_argument("--full", action="store_true", help="with --invoke: write every row to DynamoDB, not just changes")
    ap.add_argument("--schedule", action="store_true", help="also try an hourly EventBridge rule (denied today)")
    ap.add_argument("--intel-only", action="store_true", help="deploy just the curated-store Lambda")
    a = ap.parse_args()
    sources = [] if a.intel_only else (a.only or list(COLLECTORS))
    print(f"Account {account}, region {REGION}, prefix {TEAM}-*")
    step("S3 buckets", make_buckets)
    step("DynamoDB tables", make_tables)
    gateway = step("API Gateway", api)
    if gateway and (a.intel_only or not a.only):
        print("\n[intel] curated district_intel store")
        step("intel Lambda", deploy_intel, gateway)
        print("\n[store] website data (DynamoDB)")
        step("store Lambda", deploy_store, gateway)
    src = upload_package() if sources else None
    for source in sources:
        print(f"\n[{source}] {COLLECTORS[source][2]}")
        step(f"{source} state", seed_state, source)
        arn = step(f"{source} Lambda", deploy, source, src)
        if not arn:
            continue
        if gateway:
            step(f"{source} route", add_route, gateway, source, arn)
        if a.schedule:  # EventBridge PutRule is denied to the Builder role today; kept for when it is enabled
            step("hourly schedule", schedule_hourly, source, arn)
        if a.invoke:
            step(f"{source} run", invoke, source, a.full)
