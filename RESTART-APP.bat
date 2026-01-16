@echo off
title 🔄 Restart App
color 0C
cls

echo ========================================
echo  🔄 Restarting Application
echo ========================================
echo.

REM Kill existing processes
echo 🛑 Stopping existing processes...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo ✅ Processes stopped
echo.

cd /d "%~dp0"

REM Start PC1
echo 🖥️  Starting PC1 Desktop App...
start "PC1 Desktop" npm start

timeout /t 3 /nobreak

REM Start PC2
echo 🎬 Starting PC2 Display Server...
start "PC2 Display" node pc2-server.js

echo.
echo ✅ App restarted!
echo.
echo ℹ️  F12 to see console logs
echo ℹ️  Test from mobile now
echo.
pause

