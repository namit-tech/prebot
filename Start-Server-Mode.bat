@echo off
title 🤖 Offline AI Assistant - Server Mode
color 0A
cls

echo ==========================================
echo 🤖 Offline AI Assistant - Server Mode
echo ==========================================
echo.

REM Check for existing server instance
netstat -an | findstr :5001 >nul 2>&1
if %errorlevel% equ 0 (
    echo ℹ️  Server already running on port 5001
    echo.
) else (
    echo 🔍 Checking Node.js installation...
    where node >nul 2>&1
    if %errorlevel% neq 0 (
        echo ❌ Node.js not found! Please install Node.js first.
        echo.
        echo Download from: https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
    
    echo ✅ Node.js found
    echo.
    
    REM Check if dependencies are installed
    if not exist "node_modules" (
        echo 📦 Installing dependencies... (This may take a few minutes on first run)
        call npm install --silent
        if %errorlevel% neq 0 (
            echo ❌ Failed to install dependencies!
            pause
            exit /b 1
        )
        echo ✅ Dependencies installed
        echo.
    )
)

REM Start the server
echo 🚀 Starting Offline AI Assistant Server...
echo.
echo ℹ️  This window must remain open to keep server running
echo ℹ️  QR Code will appear below for mobile connection
echo ℹ️  Press Ctrl+C to stop the server
echo.
echo ==========================================
echo.

REM Get local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found

REM Clear any spaces from IP
set IP=%IP: =%

echo 📱 Scan QR Code to connect from mobile:
echo 🌐 Or visit: http://%IP%:5001
echo.

REM Start electron with server mode
start "" "%~dp0node_modules\.bin\electron.cmd" . --server-mode

REM Keep window open
timeout /t 30 /nobreak >nul

echo.
echo ==========================================
echo ✅ Server is ready!
echo.
echo This window will close automatically...
timeout /t 5

