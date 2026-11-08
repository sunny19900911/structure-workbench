@echo off
chcp 65001 >nul
"%~dp0runtime\node\node.exe" "%~dp0app\deploy\portable\mcp-setup.mjs" --open
if errorlevel 1 pause
exit /b
