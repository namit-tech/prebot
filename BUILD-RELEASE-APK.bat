@echo off
echo ========================================
echo Building RELEASE Android APK
echo ========================================
echo.
echo NOTE: Release APK requires signing key
echo For testing, use BUILD-MOBILE-APK.bat instead
echo.
pause

cd /d "%~dp0"

echo [Step 1/4] Checking prerequisites...
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

echo [Step 2/4] Copying latest files to www folder...
echo.

REM Copy mobile-questions.html to www folder
if exist "mobile-questions.html" (
    copy /Y "mobile-questions.html" "www\mobile-questions.html" >nul
    echo [OK] Copied mobile-questions.html
)

echo [Step 3/4] Syncing files to Android project...
echo.

call npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed
    pause
    exit /b 1
)

echo [Step 4/4] Building Release APK...
echo.

cd android

REM Build release APK
echo Building release APK (this may take a few minutes)...
call gradlew.bat assembleRelease
if errorlevel 1 (
    echo.
    echo ERROR: Release APK build failed
    echo.
    echo NOTE: Release builds require signing configuration
    echo For testing, use BUILD-MOBILE-APK.bat to build debug APK
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo RELEASE BUILD SUCCESSFUL!
echo ========================================
echo.
echo Your signed APK is ready at:
echo   android\app\build\outputs\apk\release\app-release.apk
echo.
echo ========================================
pause

