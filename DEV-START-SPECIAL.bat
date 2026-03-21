@echo off
title 🤖 AI Assistant - Special Edition Dev Mode
color 0E
cls

echo ========================================
echo  🚀 Starting Special Edition in DEV MODE
echo ========================================
echo.
echo  1. Starting Vite Frontend (Port 5173)...
echo  2. Starting Local Backend (Port 5000)...
echo  3. Starting Electron with Hot Reload...
echo.

cd /d "%~dp0"

REM 1. Start Vite Frontend in background
start "Vite Dev Server" cmd /c "cd frontend && npm run dev"

REM 2. Start Local Backend in background (if needed)
start "Backend Dev" cmd /c "cd backend && npm run dev"

echo.
echo Waiting 5 seconds for servers to initialize...
timeout /t 5 /nobreak >nul

REM 3. Start Electron in frontend-aware mode
echo 🤖 Launching Electron...
npx electron . --dev-server

echo.
echo ========================================
echo  ✅ Application closed
echo ========================================
echo.
pause
