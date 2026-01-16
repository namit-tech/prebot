@echo off
echo Building Offline AI Assistant Desktop App...
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo ERROR: Dependencies not installed!
    echo Please run install.bat first.
    echo.
    pause
    exit /b 1
)

echo Building Frontend...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo Copying Frontend to Root...
xcopy /s /y /e frontend\dist\* .

echo Building Windows executable...
npm run build-win

if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ Build completed successfully!
echo.
echo The executable can be found in the 'dist' folder.
echo You can now distribute the app to other users!
echo.
echo Files created:
dir dist /b
echo.
pause
