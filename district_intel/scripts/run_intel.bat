@echo off
REM District Intelligence: refresh the sources that are due, then rebuild the curated store.
REM Every source is collected hourly (config.yaml every_minutes). Task Scheduler runs this hourly and at sign-in:
REM   schtasks /Create /TN "DistrictIntel" /SC DAILY /ST 06:00 /TR "\"D:\farmwisenew\district_intel\scripts\run_intel.bat\"" /RL LIMITED /F
cd /d "%~dp0.."
if exist "..\chennai_news_pipeline\.venv\Scripts\python.exe" (
  set PY="..\chennai_news_pipeline\.venv\Scripts\python.exe"
) else (
  set PY=python
)
set PYTHONIOENCODING=utf-8
%PY% run_pipeline.py refresh >> output\refresh.log 2>&1
REM AWS copy (team 37): the curated store to S3, and the two sources that cannot run in Lambda
REM (CPCB needs a browser, police is Node.js). Each sends only what changed; no AWS keys needed.
%PY% ..\aws\export_intel.py >> output\aws.log 2>&1
%PY% ..\aws\push.py cpcb police >> output\aws.log 2>&1
