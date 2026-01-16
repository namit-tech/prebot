@echo off
echo ========================================
echo Capacitor Setup for Mobile App
echo ========================================
echo.

echo [1/4] Installing Capacitor dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/4] Initializing Capacitor...
call npx cap init "AI Assistant Questions" "com.offlineai.mobilequestions" --web-dir="."
if errorlevel 1 (
    echo ERROR: Capacitor init failed
    pause
    exit /b 1
)

echo.
echo [3/4] Adding Android platform...
call npx cap add android
if errorlevel 1 (
    echo ERROR: Adding Android platform failed
    pause
    exit /b 1
)

echo.
echo [4/4] Syncing files...
call npx cap sync
if errorlevel 1 (
    echo ERROR: Sync failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Install Android Studio (if not installed)
echo 2. Run: npm run cap:open:android
echo 3. Build APK in Android Studio
echo.
pause


