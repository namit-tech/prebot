@echo off
title 🎬 PC2 Animation Display
color 0E
cls

echo ========================================
echo  🎬 PC2 Animation Display Server
echo  Receives triggers from PC1
echo ========================================
echo.

REM Check Node.js installation
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo.
    echo 📥 Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js installed
echo.

REM Get to the script directory
cd /d "%~dp0"

REM Install dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing dependencies (first time setup)...
    echo    This may take 2-3 minutes. Please wait...
    echo.
    call npm install --silent
    if %errorlevel% neq 0 (
        echo.
        echo ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Start the server
echo.
echo 🎬 Starting PC2 Animation Display...
echo.
echo 📡 Listening for triggers from PC1...
echo 📺 Display will show animation when triggered
echo.
echo ℹ️  Keep this window open
echo ℹ️  Press Ctrl+C to stop
echo.
echo ========================================
echo.

REM Start the application
node pc2-server.js

pause

