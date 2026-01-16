@echo off
title 🤖 AI Assistant - START HERE
color 0B
cls

echo ========================================
echo  🤖 AI Assistant - Single Click Launcher
echo ========================================
echo.
echo  This is your ONE-CLICK application!
echo  Just double-click this file to start.
echo.
echo ========================================
echo.

cd /d "%~dp0"

echo Checking files...
if exist "launcher.js" (
    echo ✅ launcher.js found
) else (
    echo ❌ launcher.js NOT found!
    echo.
    pause
    exit /b 1
)

if exist "launcher.html" (
    echo ✅ launcher.html found
) else (
    echo ❌ launcher.html NOT found!
    echo.
    pause
    exit /b 1
)

if exist "node_modules" (
    echo ✅ node_modules found
) else (
    echo ❌ node_modules NOT found - Installing now...
    echo.
    call npm install --silent
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
)

echo.
echo 🚀 Starting Launcher...
echo.
echo ⚠️  The launcher window will open in a moment...
echo ⚠️  This window will stay open to show any errors
echo.

npx electron launcher.js

echo.
echo ========================================
echo Launcher closed with exit code: %errorlevel%
echo ========================================
echo.
pause
