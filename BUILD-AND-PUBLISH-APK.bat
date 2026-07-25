@echo off
title Build and Publish PreBot APK
echo ========================================
echo  Build ^& Publish PreBot Android APK
echo ========================================
echo.
echo This will:
echo   1. Build the frontend and sync it into www/
echo   2. Run Capacitor sync + Gradle assembleDebug
echo   3. Copy the APK into frontend\public\downloads
echo   4. Update latest-version.json so the Download Portal serves it
echo.

cd /d "%~dp0"

call npm run build:apk
if errorlevel 1 (
    echo.
    echo BUILD FAILED - see the errors above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  DONE
echo ========================================
echo.
echo Deploy the site (npm run build:frontend, then upload frontend\dist)
echo so admin.elloindia.in serves the new APK.
echo.
pause
