@echo off
setlocal
cd /d "%~dp0"
echo.
echo P2PFlow Version Update
echo 1. Feature / normal update  ^(1.1 to 1.2^)
echo 2. Hotfix                 ^(1.1 to 1.1.1^)
echo.
set /p choice=Choose 1 or 2 [1]: 
if "%choice%"=="2" (
  node scripts\set-version.js hotfix
) else (
  node scripts\set-version.js minor
)
if errorlevel 1 (
  echo.
  echo Version update failed. Confirm Node.js is installed and try again.
  pause
  exit /b 1
)
echo.
echo Version is ready. Open GitHub Desktop, review Changes, Commit to main, then Push origin.
pause
