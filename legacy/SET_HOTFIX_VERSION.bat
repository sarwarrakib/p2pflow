@echo off
setlocal
cd /d "%~dp0"
node scripts\set-version.js patch
if errorlevel 1 (
  echo.
  echo Version update failed. Confirm Node.js is installed and try again.
  pause
  exit /b 1
)
echo.
echo Hotfix version is ready. Open GitHub Desktop, Commit to main, then Push origin.
pause
