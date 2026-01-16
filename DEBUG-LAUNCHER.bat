@echo off
title 🔍 Debug Launcher
color 0A
cls

echo ========================================
echo  🔍 Debug Mode - Launcher
echo ========================================
echo.

cd /d "%~dp0"

echo Checking files...
if exist "launcher.js" (
    echo ✅ launcher.js found
) else (
    echo ❌ launcher.js NOT found!
)

if exist "launcher.html" (
    echo ✅ launcher.html found
) else (
    echo ❌ launcher.html NOT found!
)

if exist "node_modules" (
    echo ✅ node_modules found
) else (
    echo ❌ node_modules NOT found - run npm install
)

echo.
echo Starting launcher with full error output...
echo.

npx electron launcher.js

echo.
echo Launcher closed with exit code: %errorlevel%
echo.
pause


