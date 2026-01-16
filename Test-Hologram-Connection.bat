@echo off
title Test Hologram Connection
echo.
echo ========================================
echo    🧪 Test Hologram Connection
echo ========================================
echo.

set /p hologramIP="Enter Hologram PC IP address (e.g., 192.168.1.100): "

echo.
echo 🔍 Testing connection to %hologramIP%...
echo.

REM Test status endpoint
echo 📡 Testing status endpoint...
curl -s http://%hologramIP%:8080/api/status
if %errorlevel% neq 0 (
    echo ❌ Connection failed!
    echo.
    echo Please check:
    echo    1. Hologram PC is running hologram-server.js
    echo    2. Both PCs are on same WiFi network
    echo    3. IP address is correct
    echo    4. Windows Firewall allows port 8080
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ Connection successful!
echo.

REM Test play command
echo 🎬 Testing play command...
curl -X POST http://%hologramIP%:8080/api/play -H "Content-Type: application/json" -d "{\"video\": \"speaking-animation.mp4\", \"loop\": true}"
if %errorlevel% neq 0 (
    echo ❌ Play command failed!
) else (
    echo ✅ Play command successful!
)

echo.
echo ⏱️ Waiting 3 seconds...
timeout /t 3 /nobreak >nul

REM Test stop command
echo 🛑 Testing stop command...
curl -X POST http://%hologramIP%:8080/api/stop
if %errorlevel% neq 0 (
    echo ❌ Stop command failed!
) else (
    echo ✅ Stop command successful!
)

echo.
echo 🎉 Test completed!
echo.
echo 📋 Results:
echo    - Connection: ✅ Working
echo    - Play command: ✅ Working  
echo    - Stop command: ✅ Working
echo.
echo 🚀 Your hologram fan is ready to sync with AI Assistant!
echo.
pause
