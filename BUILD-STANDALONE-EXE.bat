@echo off
title 🤖 Building Standalone Executable
color 0B
cls

echo ========================================
echo  🤖 Offline AI Assistant
echo  Building Standalone Portable Executable
echo ========================================
echo.

REM Navigate to script directory
cd /d "%~dp0"

REM Check if we're in the prebot subdirectory, if not, navigate to it
if not exist "package.json" (
    if exist "prebot\package.json" (
        echo 📁 Navigating to prebot directory...
        cd prebot
    ) else (
        echo ❌ Error: Could not find package.json!
        echo    Please run this script from the prebot project folder.
        pause
        exit /b 1
    )
)

echo 📦 Step 1: Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo.
    echo 📥 Please install Node.js from: https://nodejs.org/
    echo    Then run this script again.
    echo.
    pause
    exit /b 1
)
echo ✅ Node.js found
echo.

echo 📦 Step 2: Checking dependencies...
if not exist "node_modules" (
    echo 📥 Installing dependencies (this may take a few minutes)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)
echo.

echo 🔨 Step 3: Cleaning old build files...
echo    Closing any running instances...
echo.

REM Kill any running processes that might lock files
taskkill /F /IM "Offline AI Assistant.exe" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

REM Clean dist folder if it exists
if exist "dist" (
    echo 🗑️  Removing old build files...
    rmdir /S /Q "dist" 2>nul
    if %errorlevel% neq 0 (
        echo ⚠️  Could not delete dist folder (files might be locked)
        echo    Please close any running instances and try again
        echo    Or run CLEAN-BUILD.bat first
        echo.
        pause
        exit /b 1
    )
    timeout /t 1 /nobreak >nul
)

echo.
echo 🔨 Step 4: Building standalone executable...
echo    This will create a portable .exe file in the 'dist' folder.
echo    This may take 5-10 minutes. Please wait...
echo.

REM Run build (environment variables are set in package.json via cross-env)
call npm run build-win

if %errorlevel% neq 0 (
    echo.
    echo ❌ Build failed! Please check the error messages above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ BUILD SUCCESSFUL!
echo ========================================
echo.
echo 📁 Your standalone executable is located at:
echo    dist\Offline AI Assistant-1.0.0-Portable.exe
echo.
echo 📋 What to do next:
echo    1. Find the .exe file in the 'dist' folder
echo    2. Share ONLY this .exe file with users
echo    3. Users can double-click it to run - no installation needed!
echo.
echo 💡 The .exe file is completely self-contained:
echo    - Includes all dependencies
echo    - Includes all assets (videos, icons)
echo    - Works on any Windows PC (no Node.js needed)
echo    - Works completely offline
echo.
echo ========================================
pause

