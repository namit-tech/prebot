@echo off
echo ========================================
echo Building Android APK for Mobile App
echo ========================================
echo.

cd /d "%~dp0"

echo [Step 1/4] Checking prerequisites...
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not installed or not in PATH
    pause
    exit /b 1
)

echo [OK] Node.js and npm found
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo [Step 2/4] Syncing files to Android project...
echo.

REM Use the existing sync script which handles all file copying
call Sync-To-Android.bat
if errorlevel 1 (
    echo ERROR: Sync failed
    echo Please check the error messages above
    pause
    exit /b 1
)

echo [OK] Files synced successfully
echo.

echo [Step 4/4] Building APK...
echo.

REM Navigate to android directory
cd android

REM Check if gradlew exists
if not exist "gradlew.bat" (
    echo ERROR: gradlew.bat not found in android folder
    echo Please run: npx cap add android
    cd ..
    pause
    exit /b 1
)

REM Build debug APK
echo Building debug APK (this may take a few minutes)...
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo.
    echo ERROR: APK build failed
    echo Please check the error messages above
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo BUILD SUCCESSFUL!
echo ========================================
echo.
echo Your APK is ready at:
echo   android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo To install on your device:
echo   1. Transfer the APK to your Android phone
echo   2. Enable "Install from Unknown Sources" in settings
echo   3. Open the APK file and install
echo.
echo OR use ADB (if connected):
echo   adb install android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo ========================================
pause

