@echo off
title 🤖 AI Assistant Server - PC1 Core Engine
color 0B
cls

echo ========================================
echo  🤖 Offline AI Assistant - Server Mode
echo  PC1: Core Engine Server
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
echo 🚀 Starting AI Assistant Server...
echo.
echo 📱 Share this computer with mobile on same WiFi
echo 🎬 Connect PC2 to this server for animation
echo.
echo ℹ️  Keep this window open to keep server running
echo ℹ️  Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

REM Start both the server AND the Electron app
echo.
echo 🖥️  Starting Desktop Application...
echo.

REM Start Electron app in a separate window
start "AI Assistant UI" npm start

REM Start the server
node server.js

REM If execution reaches here, there was an error
echo.
echo ❌ Server stopped unexpectedly
echo.
pause

