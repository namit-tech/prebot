@echo off
title 🔍 Debug Mode - Start All
color 0A
cls

echo ============================================
echo  🔍 DEBUG MODE - Starting All
echo ============================================
echo.

cd /d "%~dp0"

echo 🖥️  Starting PC1 Desktop App...
start "PC1 Desktop" npm start

timeout /t 3 /nobreak

echo 🎬 Starting PC2 Display Server...
start "PC2 Display" node pc2-server.js

echo.
echo ✅ Both servers started!
echo.
echo 🔍 Open DevTools (F12) in the app to see debug logs
echo 📱 Test from mobile and check console logs
echo.
pause

