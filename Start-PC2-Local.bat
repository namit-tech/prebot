@echo off
title 🎬 PC2 Display - Same PC Testing
color 0E
cls

echo ========================================
echo  🎬 PC2 Display Server (Same PC)
echo  Testing on localhost (port 3001)
echo ========================================
echo.

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    pause
    exit /b 1
)

echo ✅ Node.js installed
echo.

REM Install dependencies if needed
cd /d "%~dp0"
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install --silent
)

echo.
echo 🎬 Starting PC2 Display on localhost...
echo 📺 Display will open at: http://localhost:3001/display
echo.
echo ℹ️  Keep this window open
echo ℹ️  PC1 will send triggers to localhost
echo.

REM Start the PC2 server
node pc2-server.js

pause

