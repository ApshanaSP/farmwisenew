@echo off
rem One-time install of PaddleOCR for the Manu Desk (about 1 GB, into .venv in this folder).
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  python -m venv .venv || exit /b 1
)
.venv\Scripts\python.exe -I export_windows_certs.py .venv\windows-certs.pem || exit /b 1
.venv\Scripts\python.exe -m pip install --disable-pip-version-check --cert .venv\windows-certs.pem -r requirements.txt || exit /b 1
echo.
echo PaddleOCR is installed. start-fast.bat now starts it with the site.
