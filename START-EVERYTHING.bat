@echo off
title 🤖 Start Everything - PC1 + PC2
color 0C
cls

echo ============================================
echo  🚀 Starting Complete System
echo  PC1 + PC2 on Same PC
echo ============================================
echo.

cd /d "%~dp0"

REM Start PC1 (Electron App)
echo 🖥️  Starting PC1 (Desktop App)...
start "PC1 Desktop" npm start

REM Wait a bit
timeout /t 3 /nobreak >nul

REM Start PC2 (Display Server)
echo 🎬 Starting PC2 (Display Server)...
start "PC2 Display" node pc2-server.js

echo.
echo ✅ Both servers are starting!
echo.
echo ℹ️  PC1: Desktop window will open
echo ℹ️  PC2: Running on localhost:3001
echo.
echo Press any key to exit (servers will keep running)...
pause >nul

