@echo off
rem Public https link for District IQ. The server must already be running on port 3000 (host-server.bat).
rem Uses Cloudflare's tunnel if C:\Users\DELL\cloudflared\cloudflared.exe exists, else localhost.run over SSH (no install).
rem The link is printed below ("https://....trycloudflare.com" or "https://....lhr.life"). Keep this window open.
title District IQ public link
set CF=C:\Users\DELL\cloudflared\cloudflared.exe
:again
if exist "%CF%" (
  "%CF%" tunnel --url http://127.0.0.1:3000
) else (
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 80:127.0.0.1:3000 nokey@localhost.run
)
echo Tunnel dropped. Reconnecting in 5 seconds (the link may change; close this window to stop)...
timeout /t 5 >nul
goto again
