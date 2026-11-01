@echo off
rem District IQ, fast: the production build (pages open in about a second; the dev server compiles each page on first
rem use, 45-65 s on this PC, which is what made signing in slow). Builds once, then starts at http://127.0.0.1:3000.
rem After changing the code, run this with "rebuild":  start-fast.bat rebuild
cd /d %~dp0chennai-grievance-portal-main
set NEXT_DIST_DIR=.next-prod
if /I "%1"=="rebuild" rmdir /s /q .next-prod 2>nul
if not exist .next-prod\BUILD_ID (
  echo Building District IQ once (a few minutes)...
  call npm run build || exit /b 1
)
rem Jarvis speaks Tamil with Microsoft Edge's own voice (Pallavi), so the console opens in Edge
start "" msedge http://127.0.0.1:3000/login || start "" http://127.0.0.1:3000/login
call npm run start -- -p 3000
