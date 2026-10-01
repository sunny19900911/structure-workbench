@echo off
setlocal
title Structural AI Workbench

set "DEMO_DIR=%~dp0web-demo"
set "PNPM_EXE="
set "DEMO_PORT=5190"
set "DEMO_URL=http://127.0.0.1:%DEMO_PORT%/workbuddy-integrated-studio.html?v=task6-calculation-book"

where pnpm.cmd >nul 2>nul
if not errorlevel 1 set "PNPM_EXE=pnpm.cmd"

if not defined PNPM_EXE (
  set "PNPM_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
)

if not exist "%DEMO_DIR%\package.json" (
  echo [ERROR] Demo folder was not found:
  echo %DEMO_DIR%
  goto :failed
)

if not "%PNPM_EXE%"=="pnpm.cmd" if not exist "%PNPM_EXE%" (
  echo [ERROR] pnpm.cmd was not found.
  goto :failed
)

cd /d "%DEMO_DIR%"
if errorlevel 1 goto :failed

if not exist "node_modules" (
  echo Installing dependencies for the first launch...
  call "%PNPM_EXE%" install
  if errorlevel 1 goto :failed
)

echo.
echo Structural AI Workbench is starting.
echo Keep this window open while using the website.
echo.
echo Main workbench:
echo %DEMO_URL%
echo.
echo Press Ctrl+C to stop the service.
echo.

powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort %DEMO_PORT% -State Listen -ErrorAction SilentlyContinue){exit 1}else{exit 0}"
if errorlevel 1 (
  echo [ERROR] Port %DEMO_PORT% is already in use. Close the old Demo window and try again.
  goto :failed
)

start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='%DEMO_URL%'; for($i=0;$i -lt 80;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1;if($r.StatusCode -eq 200){Start-Process $u;break}}catch{};Start-Sleep -Milliseconds 500}"
call "%PNPM_EXE%" exec vite --host 127.0.0.1 --port %DEMO_PORT% --strictPort
if errorlevel 1 goto :failed
goto :eof

:failed
echo.
echo [ERROR] The Demo did not start. Keep this window open and review the message above.
pause
exit /b 1
