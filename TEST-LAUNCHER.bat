@echo off
title 🔍 Test Launcher
color 0E
cls

echo ========================================
echo  🔍 Testing Launcher
echo ========================================
echo.

cd /d "%~dp0"

echo Step 1: Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    pause
    exit /b 1
)
node --version
echo ✅ Node.js found
echo.

echo Step 2: Checking files...
if exist "launcher.js" (
    echo ✅ launcher.js found
) else (
    echo ❌ launcher.js NOT found!
    pause
    exit /b 1
)

if exist "launcher.html" (
    echo ✅ launcher.html found
) else (
    echo ❌ launcher.html NOT found!
    pause
    exit /b 1
)
echo.

echo Step 3: Checking Electron...
if exist "node_modules\electron" (
    echo ✅ Electron installed
) else (
    echo ❌ Electron not installed!
    echo.
    echo Installing Electron...
    call npm install electron --save-dev
    if %errorlevel% neq 0 (
        echo ❌ Failed to install Electron!
        pause
        exit /b 1
    )
)
echo.

echo Step 4: Testing launcher...
echo.
echo Running: npx electron launcher.js
echo.
echo ⚠️  If the launcher window doesn't appear, check for errors below
echo ⚠️  This window will stay open
echo.

npx electron launcher.js

echo.
echo ========================================
echo Test completed
echo ========================================
echo.
pause


