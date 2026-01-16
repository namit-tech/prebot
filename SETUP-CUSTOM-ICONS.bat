@echo off
title 🎨 Custom Icons Setup Helper
color 0E
cls

echo ========================================
echo  🎨 Custom Icons Setup Helper
echo ========================================
echo.

cd /d "%~dp0"

REM Check if we're in the prebot subdirectory
if not exist "package.json" (
    if exist "prebot\package.json" (
        cd prebot
    )
)

echo 📋 This script will help you set up custom icons for:
echo    1. Desktop Application (.exe)
echo    2. Mobile Application (Android APK)
echo.
echo ========================================
echo.

echo 🖥️  DESKTOP ICON (Windows .exe)
echo ========================================
echo.
echo Requirements:
echo   - Format: .ico (Windows Icon)
echo   - Recommended size: 256x256 or 512x512 pixels
echo   - Location: assets\icon.ico
echo.
echo Steps:
echo   1. Create your icon image (square, 512x512 recommended)
echo   2. Convert to .ico format using:
echo      - https://convertio.co/png-ico/
echo      - https://www.icoconverter.com/
echo   3. Save as: assets\icon.ico
echo   4. Rebuild: npm run build-win
echo.
echo Current status:
if exist "assets\icon.ico" (
    echo   ✅ icon.ico found
) else (
    echo   ❌ icon.ico NOT found
    echo   📝 You need to create assets\icon.ico
)
echo.

echo ========================================
echo.

echo 📱 MOBILE ICON (Android APK)
echo ========================================
echo.
echo Requirements:
echo   - Format: .png (PNG images)
echo   - Multiple sizes needed:
echo     * mdpi: 48x48 px
echo     * hdpi: 72x72 px
echo     * xhdpi: 96x96 px
echo     * xxhdpi: 144x144 px
echo     * xxxhdpi: 192x192 px
echo.
echo Steps:
echo   1. Create your icon (1024x1024 recommended)
echo   2. Use Android Asset Studio:
echo      https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
echo   3. Download generated icons
echo   4. Replace files in:
echo      android\app\src\main\res\mipmap-*\ic_launcher.png
echo   5. Rebuild APK
echo.
echo Current status:
if exist "android\app\src\main\res\mipmap-mdpi\ic_launcher.png" (
    echo   ✅ Android icons found
    echo   📝 Replace them with your custom icons
) else (
    echo   ❌ Android icons not found
    echo   📝 Run: npm run cap:sync first
)
echo.

echo ========================================
echo.
echo 💡 TIP: Create one 1024x1024 icon, then resize to all sizes
echo.
pause


