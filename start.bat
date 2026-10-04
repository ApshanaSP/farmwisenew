@echo off
rem Starts the portable MySQL server (if not already running) and the District IQ web app.
tasklist /FI "IMAGENAME eq mysqld.exe" | find /I "mysqld.exe" >nul || start "" /B "D:\farm\mysql\bin\mysqld.exe" --defaults-file=D:\farm\mysql\my.ini
timeout /t 5 /nobreak >nul
cd /d D:\farm\chennai-grievance-portal-main
start "" http://localhost:3000
npm run dev
