@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [BULLET LAB] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo Please install Node.js 20 or later from https://nodejs.org/
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo [BULLET LAB] Installing packages on first launch...
    call npm install
    if errorlevel 1 (
        echo Installation failed. Check your internet connection.
        pause
        exit /b 1
    )
)
echo [BULLET LAB] Start both web and multiplayer server.
echo Open http://localhost:5173 in your browser.
call npm run dev
pause
