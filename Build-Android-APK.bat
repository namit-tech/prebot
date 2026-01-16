@echo off
echo ========================================
echo Building Android APK
echo ========================================
echo.

echo [1/3] Syncing files to Android project...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Sync failed
    pause
    exit /b 1
)

echo.
echo [2/3] Opening Android Studio...
echo Please build APK in Android Studio:
echo   1. Click "Build" menu
echo   2. Select "Build Bundle(s) / APK(s)"
echo   3. Select "Build APK(s)"
echo   4. Wait for build to complete
echo   5. APK will be in: android\app\build\outputs\apk\debug\
echo.
call npx cap open android

echo.
echo ========================================
echo Android Studio opened!
echo ========================================
echo.
echo Build the APK in Android Studio, then:
echo - APK location: android\app\build\outputs\apk\debug\app-debug.apk
echo - Install on device: adb install app-debug.apk
echo.
pause


