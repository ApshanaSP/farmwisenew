@echo off
REM This PC's share of the hourly data load. GitHub builds the store from every source and uploads it to AWS each hour
REM (github.com/ApshanaSP/farmwisenew-dataload, started by cron-job.org), but GitHub's machines cannot reach the CPCB
REM site, so the PC collects CPCB and sends its files to that repo's `cpcb` branch for GitHub's next build.
REM Task Scheduler runs this hourly and at sign-in:
REM   schtasks /Create /TN "DistrictIntel" /SC DAILY /ST 06:00 /TR "\"D:\farmwisenew\district_intel\scripts\run_intel.bat\"" /RL LIMITED /F
REM A full local collection and build still works by hand: python run_pipeline.py refresh --all
cd /d "%~dp0.."
if exist "..\chennai_news_pipeline\.venv\Scripts\python.exe" (
  set PY="..\chennai_news_pipeline\.venv\Scripts\python.exe"
) else (
  set PY=python
)
set PYTHONIOENCODING=utf-8
%PY% run_pipeline.py refresh --all --only cpcb --no-build >> output\refresh.log 2>&1
%PY% scripts\push_cpcb.py >> output\aws.log 2>&1
REM AWS's raw copy of the CPCB readings (DynamoDB), as before; the API key needs no AWS keys
%PY% ..\aws\push.py cpcb >> output\aws.log 2>&1
