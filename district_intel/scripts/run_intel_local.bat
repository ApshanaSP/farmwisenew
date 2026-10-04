@echo off
REM District Intelligence, local only (no AWS): collect the sources that are due, rebuild the curated store
REM and copy it into the local MySQL. Task Scheduler runs this hourly through run_intel_local_hidden.vbs:
REM   schtasks /Create /TN "DistrictIntel" /SC HOURLY /TR "wscript.exe \"D:\farm\district_intel\scripts\run_intel_local_hidden.vbs\"" /RL LIMITED /F
REM The collectors run with the "python" on PATH (config.yaml); the build uses this folder's .venv.
cd /d "%~dp0.."
if exist ".venv\Scripts\python.exe" (
  set PY=".venv\Scripts\python.exe"
) else (
  set PY=python
)
set PYTHONIOENCODING=utf-8
echo ===== %DATE% %TIME% >> output\refresh.log
%PY% run_pipeline.py refresh >> output\refresh.log 2>&1
