@echo off
title Offline AI Assistant - Debug Mode
color 0A
cls

echo ========================================
echo  🤖 Offline AI Assistant
echo  Running with Console Output
echo ========================================
echo.
echo This window will stay open to show errors.
echo Close this window to exit the application.
echo.
echo ========================================
echo.

REM Check if portable exe exists in dist folder
if exist "dist\Offline AI Assistant-1.0.0-Portable.exe" (
    echo ✅ Found portable executable in dist folder
    echo 🚀 Starting application...
    echo.
    "dist\Offline AI Assistant-1.0.0-Portable.exe"
) else if exist "Offline AI Assistant-1.0.0-Portable.exe" (
    echo ✅ Found portable executable in current folder
    echo 🚀 Starting application...
    echo.
    "Offline AI Assistant-1.0.0-Portable.exe"
) else if exist "dist\win-unpacked\Offline AI Assistant.exe" (
    echo ✅ Found unpacked executable (build in progress or portable build failed)
    echo 🚀 Starting application from unpacked folder...
    echo.
    echo ℹ️  Note: This is the unpacked version. For distribution, use the portable .exe
    echo.
    "dist\win-unpacked\Offline AI Assistant.exe"
) else (
    echo ❌ Executable not found!
    echo.
    echo Please make sure you're running this from the project folder
    echo and that the executable has been built.
    echo.
    echo To build the executable, run:
    echo   BUILD-STANDALONE-EXE.bat
    echo.
    echo Or manually:
    echo   npm run build-win
    echo.
    echo Expected locations:
    echo   - dist\Offline AI Assistant-1.0.0-Portable.exe (portable version)
    echo   - dist\win-unpacked\Offline AI Assistant.exe (unpacked version)
    echo   - Offline AI Assistant-1.0.0-Portable.exe (if copied here)
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Application closed.
echo Exit code: %errorlevel%
echo ========================================
echo.
pause

