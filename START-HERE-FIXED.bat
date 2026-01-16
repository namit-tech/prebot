@echo off
title 🤖 AI Assistant - START HERE
color 0B
cls

echo ========================================
echo  🤖 AI Assistant - Single Click Launcher
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

REM Check if launcher files exist
if not exist "launcher.js" (
    echo ❌ launcher.js not found!
    echo.
    pause
    exit /b 1
)

if not exist "launcher.html" (
    echo ❌ launcher.html not found!
    echo.
    pause
    exit /b 1
)

echo.
echo 🚀 Starting Launcher...
echo.
echo ⚠️  IMPORTANT: Keep this window open!
echo ⚠️  The launcher window will open in a moment...
echo ⚠️  If you see errors, they will appear here.
echo.
echo ========================================
echo.

REM Start Electron in a way that keeps the window open
start "AI Assistant Launcher" cmd /k "npx electron launcher.js"

REM Wait a moment to see if there are immediate errors
timeout /t 3 /nobreak >nul

echo.
echo ✅ Launcher should be opening now...
echo.
echo ℹ️  If the launcher window doesn't appear:
echo    1. Check for error messages above
echo    2. Make sure Electron is installed (npm install)
echo    3. Try running: npx electron launcher.js
echo.
echo This window will stay open to show any errors.
echo You can close it after the launcher is working.
echo.
pause


