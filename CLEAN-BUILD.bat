@echo off
title 🧹 Cleaning Build Folder
color 0E
cls

echo ========================================
echo  🧹 Cleaning Build Folder
echo ========================================
echo.

cd /d "%~dp0"

REM Check if we're in the prebot subdirectory
if not exist "package.json" (
    if exist "prebot\package.json" (
        cd prebot
    )
)

echo 🔍 Checking for running processes...
echo.

REM Kill any running Electron/Offline AI Assistant processes
taskkill /F /IM "Offline AI Assistant.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Closed running Offline AI Assistant process
) else (
    echo ℹ️  No running Offline AI Assistant process found
)

taskkill /F /IM electron.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Closed running Electron process
) else (
    echo ℹ️  No running Electron process found
)

echo.
echo 🗑️  Cleaning dist folder...
if exist "dist" (
    rmdir /S /Q "dist" 2>nul
    if %errorlevel% equ 0 (
        echo ✅ dist folder cleaned successfully
    ) else (
        echo ⚠️  Some files couldn't be deleted (might be locked)
        echo    Trying alternative method...
        timeout /t 2 /nobreak >nul
        rmdir /S /Q "dist" 2>nul
        if %errorlevel% equ 0 (
            echo ✅ dist folder cleaned successfully
        ) else (
            echo ❌ Could not delete dist folder
            echo    Please close any running instances and try again
            echo    Or manually delete the 'dist' folder
            pause
            exit /b 1
        )
    )
) else (
    echo ℹ️  dist folder doesn't exist (nothing to clean)
)

echo.
echo ========================================
echo ✅ Cleanup Complete!
echo ========================================
echo.
echo You can now run the build:
echo   npm run build-win
echo.
echo Or use:
echo   BUILD-STANDALONE-EXE.bat
echo.
pause


