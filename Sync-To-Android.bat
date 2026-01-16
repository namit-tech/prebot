@echo off
echo ========================================
echo Syncing Files to Android Project
echo ========================================
echo.

echo [1/3] Copying web files to www directory...
if not exist "www" mkdir www

copy /Y "mobile-questions.html" "www\mobile-questions.html" >nul
copy /Y "capacitor-mobile.js" "www\capacitor-mobile.js" >nul

if exist "assets" (
    xcopy /E /I /Y "assets" "www\assets" >nul
)

echo    - mobile-questions.html copied
echo    - capacitor-mobile.js copied
echo    - assets folder copied
echo.

echo [2/3] Syncing to Android project...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Sync failed
    pause
    exit /b 1
)

echo.
echo [3/3] Updating Android Manifest...
call node Update-Android-Manifest.js
if errorlevel 1 (
    echo WARNING: Manifest update failed (may already be updated)
)

echo.
echo ========================================
echo Sync Complete!
echo ========================================
echo.
echo Next: Run "npx cap open android" to open Android Studio
echo.


