@echo off
rem PaddleOCR for the Manu Desk, on this computer only. The site's start scripts open this by themselves once setup.bat has been run.
title PaddleOCR for the Manu Desk (port 8867)
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo Run setup.bat in this folder first.
  pause
  exit /b 1
)
set PYTHONIOENCODING=utf-8
.venv\Scripts\python.exe server.py
