@echo off
setlocal
for /f "delims=" %%I in ('wsl.exe wslpath -a "%~dp0"') do set "WSL_DIR=%%I"
start "NZ Exchange News Server" wsl.exe python3 "%WSL_DIR%/app.py"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5000/"
endlocal
