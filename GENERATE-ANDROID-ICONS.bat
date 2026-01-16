@echo off
title 🎨 Generate Android Icons
color 0B
cls

echo ========================================
echo  🎨 Generate Android Icons from Icon
echo ========================================
echo.

cd /d "%~dp0"

REM Check if we're in the prebot subdirectory
if not exist "package.json" (
    if exist "prebot\package.json" (
        cd prebot
    )
)

echo This script will generate Android app icons from your source icon.
echo.
echo Source icon location: assets\icon.png or assets\icon.ico
echo.
echo ========================================
echo.

REM Check if source icon exists
if exist "assets\icon.png" (
    echo ✅ Found: assets\icon.png
    set ICON_FOUND=1
) else if exist "assets\icon.ico" (
    echo ✅ Found: assets\icon.ico
    set ICON_FOUND=1
) else (
    echo ❌ No icon file found!
    echo.
    echo Please ensure you have either:
    echo   - assets\icon.png
    echo   - assets\icon.ico
    echo.
    pause
    exit /b 1
)

echo.
echo 🔄 Generating Android icons...
echo.

REM Run the Node.js script
node generate-android-icons.js

if %errorlevel% neq 0 (
    echo.
    echo ❌ Failed to generate icons!
    echo.
    echo 📝 Alternative method:
    echo    1. Go to: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
    echo    2. Upload your icon.png
    echo    3. Download the generated icons
    echo    4. Replace files in android\app\src\main\res\mipmap-*\
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ Icons generated successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Review icons in: android\app\src\main\res\mipmap-*\
echo   2. Run: npm run cap:sync
echo   3. Build your APK
echo.
pause


