#!/usr/bin/env bash
# District IQ inside its Modal container (deploy/modal/district_iq.py starts this once per container).
# 1. Files the site changes while it runs (Studio, Jarvis's memory and Claude budget, uploads, petition scans, the grievance
#    dataset) live on the Modal disk "district-iq-data", mounted at /vol, so they outlive the container. The first start copies
#    them there from the image, which holds this PC's copy as it was at deploy time.
# 2. data/aws-cache stays on the container's own disk (its SQLite store is downloaded from AWS at every start). Its small state
#    files (news desk, stories, Differ book, AI briefing) are copied back from /vol at start and saved to /vol every minute.
# 3. PaddleOCR (the Manu Desk's first reading step) starts on 127.0.0.1:8867, then the production site on 0.0.0.0:3000.
set -u
SITE=/app/farmwisenew/chennai-grievance-portal-main
VOL=/vol
cd "$SITE"

# folders that are part of the code (tracked in git, never changed by the site): always the image's copy
STATIC=" layers gcc-reference boundaries roads i18n ocr studio-samples eval "

mkdir -p "$VOL/data" "$VOL/aws-cache"
for src in data/*; do
  name=$(basename "$src")
  [ "$name" = "aws-cache" ] && continue
  case "$STATIC" in *" $name "*) continue ;; esac
  [ -e "$VOL/data/$name" ] || cp -a "$src" "$VOL/data/$name"
  rm -rf "$src"
done
mkdir -p "$VOL/data/map-lists" "$VOL/data/lancedb" "$VOL/data/private-uploads"
for v in "$VOL"/data/*; do
  name=$(basename "$v")
  case "$STATIC" in *" $name "*) continue ;; esac
  ln -sfn "$v" "data/$name"
done

for pair in "uploads:uploads" "public/uploads:public-uploads"; do
  here=${pair%%:*}; there="$VOL/${pair##*:}"
  if [ ! -e "$there" ]; then mkdir -p "$there"; [ -d "$here" ] && cp -a "$here/." "$there/"; fi
  rm -rf "$here"; ln -sfn "$there" "$here"
done

mkdir -p data/aws-cache
if [ -n "$(ls -A "$VOL/aws-cache" 2>/dev/null)" ]; then
  cp -a "$VOL/aws-cache/." data/aws-cache/
  # files a newer deploy brings that the disk does not have yet (the market price history, for one): added, never overwriting
  cp -an /seed/aws-cache/. data/aws-cache/ 2>/dev/null || true
  # real-data files the PC rebuilds (satellite floods, CFM-DSS gauge rain, reservoir history): the deploy's copy always wins,
  # or a redeploy would never replace the disk's older copy (28 Nov review)
  for f in sat-flood.json cfm-rain.json cmwssb-lakes-history.json; do
    [ -f "/seed/aws-cache/$f" ] && cp -f "/seed/aws-cache/$f" "data/aws-cache/$f"
  done
else
  cp -a /seed/aws-cache/. data/aws-cache/ 2>/dev/null || true
fi
( while sleep 60; do bash /app/sync.sh; done ) &

if [ -f /app/farmwisenew/manu_paddle_ocr/server.py ]; then
  # 29 Nov: PaddleOCR was found stopped on the hosted site (nothing restarted it): it is started again whenever it ends
  ( cd /app/farmwisenew/manu_paddle_ocr && while true; do
      PYTHONIOENCODING=utf-8 "${PADDLE_PY:-python3}" server.py 2>&1 | sed -u 's/^/[paddle] /'
      echo "[paddle] stopped (exit $?): starting it again in 5 s"; sleep 5
    done ) &
fi

exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
