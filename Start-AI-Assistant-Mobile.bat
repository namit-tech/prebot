@echo off
title Offline AI Assistant - Desktop + Mobile
echo.
echo ========================================
echo    🤖 Offline AI Assistant
echo    📱 Desktop + Mobile Version
echo ========================================
echo.
echo Starting the application...
echo Please wait while we initialize...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version and install it.
    echo After installation, restart this application.
    echo.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    echo This may take a few minutes on first run...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo ❌ ERROR: Failed to install dependencies!
        echo Please check your internet connection.
        echo.
        pause
        exit /b 1
    )
)

echo ✅ Starting Offline AI Assistant...
echo.
echo 🎯 Instructions:
echo    - Desktop: Click any question to hear the answer
echo    - Mobile: Use the URL shown below on your phone
echo    - Both devices must be on same WiFi network
echo    - This app works completely offline!
echo.

REM Start the application
npm start

REM If the app closes, show message
echo.
echo Application closed.
pause
