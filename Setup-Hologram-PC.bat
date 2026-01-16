@echo off
title Hologram Fan Controller Setup
echo.
echo ========================================
echo    🎬 Hologram Fan Controller Setup
echo ========================================
echo.

REM Check if Node.js is installed
echo 🔍 Checking for Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version and install it.
    echo After installation, run this script again.
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js detected!
echo.

REM Check if VLC is installed
echo 🔍 Checking for VLC Media Player...
vlc --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ VLC Media Player not found!
    echo.
    echo Please install VLC from: https://www.videolan.org/vlc/
    echo Download and install VLC for Windows.
    echo After installation, run this script again.
    echo.
    pause
    exit /b 1
)

echo ✅ VLC Media Player detected!
echo.

REM Create videos folder
if not exist "videos" (
    echo 📁 Creating videos folder...
    mkdir videos
    echo ✅ Videos folder created!
) else (
    echo ✅ Videos folder already exists!
)

echo.
echo 📋 Setup Instructions:
echo    1. Put your hologram videos in the "videos" folder
echo    2. Video format: MP4 (recommended)
echo    3. Video name: speaking-animation.mp4
echo    4. Resolution: 1080x1080 (square for hologram fan)
echo.

REM Install dependencies
echo 📦 Installing dependencies...
npm install express

echo.
echo ✅ Setup completed!
echo.
echo 🚀 Starting Hologram Fan Controller...
echo.
echo 📱 This PC will now receive commands from AI Assistant
echo 🎬 Videos will play when questions are clicked
echo 🛑 Videos will stop when answers end
echo.

REM Start the server
node hologram-server.js

pause
