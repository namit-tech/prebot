@echo off
title 🤖 PC1 - Core Engine with UI
color 0B
cls

echo ========================================
echo  🤖 PC1 - Core Engine (Desktop App)
echo  Shows Questions + Answers on Screen
echo ========================================
echo.

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo.
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

echo 🚀 Starting PC1 Desktop Application...
echo.
echo ℹ️  An app window will open
echo ℹ️  Server for mobile will start automatically
echo.

REM Start the Electron app (this will show the UI + start server internally)
npm start

pause

