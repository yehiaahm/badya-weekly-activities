@echo off
rem Double-click to start (or restart) the public demo link. See "Temporary public demo link" in README.md.
rem The demo keeps running after this window is closed, until the computer shuts down.
cd /d "%~dp0"
call npm run demo:public
echo.
pause
