@echo off
title 🔄 Rebuild Android APK with Updated Icons
color 0B
cls

echo ========================================
echo  🔄 Rebuild Android APK with Updated Icons
echo ========================================
echo.

cd /d "%~dp0"

REM Check if we're in the prebot subdirectory
if not exist "package.json" (
    if exist "prebot\package.json" (
        cd prebot
    )
)

echo This script will:
echo   1. Regenerate Android icons from assets
echo   2. Clean Gradle build cache
echo   3. Force a fresh rebuild
echo.
echo ========================================
echo.

REM Step 1: Regenerate icons
echo [1/3] 🔄 Regenerating Android icons...
echo.
node generate-android-icons.js

if %errorlevel% neq 0 (
    echo.
    echo ❌ Failed to generate icons!
    pause
    exit /b 1
)

echo.
echo ✅ Icons regenerated successfully!
echo.

REM Step 2: Clean Gradle build
echo [2/3] 🧹 Cleaning Gradle build cache...
echo.

cd android

REM Clean build directories
if exist "app\build" (
    echo Removing app\build directory...
    rmdir /s /q "app\build"
)

if exist "build" (
    echo Removing build directory...
    rmdir /s /q "build"
)

REM Try to run Gradle clean if gradlew exists
if exist "gradlew.bat" (
    echo Running Gradle clean...
    call gradlew.bat clean
    if %errorlevel% neq 0 (
        echo ⚠️  Gradle clean failed, but continuing...
    )
) else (
    echo ℹ️  gradlew.bat not found, manually removed build directories
)

echo ✅ Build cache cleaned!
echo.

REM Step 3: Force rebuild
echo [3/3] 🔨 Forcing fresh rebuild...
echo.
echo Note: This will open Android Studio. 
echo       In Android Studio, click "Build" ^> "Rebuild Project"
echo       Or use: Build ^> Clean Project, then Build ^> Rebuild Project
echo.

cd ..

echo ========================================
echo ✅ Setup complete!
echo ========================================
echo.
echo Next steps in Android Studio:
echo   1. Open the project: android folder
echo   2. Go to: Build ^> Clean Project
echo   3. Then: Build ^> Rebuild Project
echo   4. Or: Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo.
echo The APK will be generated with your updated icons!
echo.
pause

