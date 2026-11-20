@echo off
chcp 65001 >nul
if exist "%~dp0结构工作台.exe" (
 start "" "%~dp0结构工作台.exe"
 exit /b
)
start "" powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
exit /b
