@echo off
rem District IQ, fast: the production build at http://127.0.0.1:3000. Use this, not "npm run dev".
rem Measured on this PC 17 Nov 2026: "npm run dev" compiles each page and data route on first use (15-40 s per click),
rem recompiles after any change and grew to 6 GB of memory; the production build answers most clicks in under 0.3 s
rem and uses under 1 GB.
rem This script closes a server already on port 3000 (such as "npm run dev"), rebuilds by itself when the code has
rem changed since the last build (about 8 minutes on this PC), then starts the site. "start-fast.bat rebuild" forces a build.
rem PaddleOCR, step one of reading a Manu, in its own small window. The desk still works without it.
if exist "%~dp0manu_paddle_ocr\.venv\Scripts\python.exe" start "PaddleOCR" /min "%~dp0manu_paddle_ocr\start.bat"
cd /d "%~dp0chennai-grievance-portal-main"
set NEXT_DIST_DIR=.next-prod
rem Avast scans HTTPS with its own certificate: without it the AWS data download fails ("unable to verify the first certificate")
if exist "C:\ProgramData\Avast Software\Avast\wscert.pem" set "NODE_EXTRA_CA_CERTS=C:\ProgramData\Avast Software\Avast\wscert.pem"
set REBUILD=
if /I "%1"=="rebuild" set REBUILD=1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-fast-check.ps1 -Dist .next-prod -Port 3000
if errorlevel 2 exit /b 1
if errorlevel 1 set REBUILD=1
if defined REBUILD goto build
goto run

:build
echo Building District IQ, about 8 minutes on this PC. Next time it starts in seconds.
rmdir /s /q .next-prod 2>nul
call npm run build || exit /b 1

:run
rem Jarvis speaks Tamil with Microsoft Edge's own voice (Pallavi), so the console opens in Edge
start "" msedge http://127.0.0.1:3000/login || start "" http://127.0.0.1:3000/login
call npm run start -- -p 3000
