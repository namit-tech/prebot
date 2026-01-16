@echo off
title 🤖 AI Assistant Launcher
color 0B
cls

echo ========================================
echo  🤖 AI Assistant Launcher
echo  Single Click Application Launcher
echo ========================================
echo.

REM Check Node.js
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

REM Install dependencies if needed
cd /d "%~dp0"
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

echo.
echo 🚀 Starting Launcher...
echo.

REM Start the launcher using Electron
npx electron launcher.js

pause


