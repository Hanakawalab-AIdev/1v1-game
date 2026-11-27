@echo off
rem Double-click to start the Stomp Duel game server (online / Wi-Fi play) and open the game.
rem Keep this window open while playing. Close it to stop the server.
title Stomp Duel server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org , then double-click this file again.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
node server.js --open
pause
