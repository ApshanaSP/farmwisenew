@echo off
rem One-time install of PaddleOCR for the Manu Desk (about 1 GB, into .venv in this folder).
rem Needs Python 3.10 to 3.13 (3.11 is the tested one) and an internet connection.
cd /d %~dp0
if exist .venv\Scripts\python.exe goto install

set PY=
for %%V in (3.11 3.12 3.10 3.13) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set PY=py -%%V
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)" >nul 2>&1 && set PY=python
)
if not defined PY (
  echo.
  echo PaddleOCR needs Python 3.10, 3.11, 3.12 or 3.13, and none was found.
  echo Install Python 3.11 from https://www.python.org/downloads/ and run this file again.
  echo The website still works without PaddleOCR: the AI OCR reads petitions alone.
  pause
  exit /b 1
)
echo Using %PY%
%PY% -m venv .venv || exit /b 1

:install
.venv\Scripts\python.exe -I export_windows_certs.py .venv\windows-certs.pem || exit /b 1
.venv\Scripts\python.exe -m pip install --disable-pip-version-check --cert .venv\windows-certs.pem -r requirements.txt || exit /b 1
echo.
echo PaddleOCR is installed. start-fast.bat, host-server.bat and npm run dev now start it with the site.
echo The first petition read downloads its reading models (about 200 MB) once.
