@echo off
title AI Smart Notes Generator
color 0B
echo ======================================================================
echo                AI SMART NOTES GENERATOR PLATFORM
echo ======================================================================
echo.
echo  [1/2] Launching your AI Notes Generator server...
echo  [2/2] Opening your web browser automatically in 2 seconds...
echo.
echo  Please keep this window open while using the website.
echo  To stop the website, simply close this window.
echo ======================================================================
echo.

cd /d "%~dp0"

:: Open the website in the default browser after a 2-second delay
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5000"

:: Start the Flask web application
python app.py

pause
