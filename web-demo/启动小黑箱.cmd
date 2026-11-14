@echo off
chcp 65001 >nul
start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0deploy\blackbox\launch-source.ps1"
