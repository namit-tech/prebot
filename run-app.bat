@echo off
echo Starting Offline AI Assistant...
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo ERROR: Dependencies not installed!
    echo Please run install.bat first.
    echo.
    pause
    exit /b 1
)

echo Starting the desktop app...
npm start

if %errorlevel% neq 0 (
    echo ERROR: Failed to start the app!
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)
