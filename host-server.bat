@echo off
rem District IQ for the public link: the production build on http://127.0.0.1:3000, with the real AWS store.
rem Keep this window open. host-tunnel.bat gives the public https link to this server.
title District IQ server (port 3000)
rem PaddleOCR, step one of reading a Manu, in its own small window. The desk still works without it.
if exist "%~dp0manu_paddle_ocr\.venv\Scripts\python.exe" start "PaddleOCR" /min "%~dp0manu_paddle_ocr\start.bat"
cd /d %~dp0chennai-grievance-portal-main
set NEXT_DIST_DIR=.next-prod
set NODE_EXTRA_CA_CERTS=C:\ProgramData\Avast Software\Avast\wscert.pem
if /I "%1"=="rebuild" rmdir /s /q .next-prod 2>nul
if not exist .next-prod\BUILD_ID (
  echo Building District IQ once (a few minutes)...
  call npm run build || exit /b 1
)
:again
call npm run start -- -p 3000
echo Server stopped. Restarting in 5 seconds (close this window to stop for good)...
timeout /t 5 >nul
goto again
