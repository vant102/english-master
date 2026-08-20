@echo off
title English Master Pro - Khoi dong ung dung...

:: ============================================================
:: English Master Pro - Launcher (Standalone Window)
:: Chay app nhu cua so doc lap (khong co thanh tab Chrome/Edge)
:: ============================================================

set "APP_DIR=%~dp0"
set "INDEX_FILE=%APP_DIR%index.html"
set "FILE_URL=file:///%INDEX_FILE:\=/%"

echo.
echo  =========================================
echo   ENGLISH MASTER PRO - Standalone Launcher
echo  =========================================
echo.

set "CHROME_64=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_32=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "EDGE_SYS=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "EDGE_64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist "%CHROME_64%" (
    start "" "%CHROME_64%" --app="%FILE_URL%" --window-size=1600,960 --window-position=100,50 --disable-extensions --no-first-run
    goto :done
)
if exist "%CHROME_32%" (
    start "" "%CHROME_32%" --app="%FILE_URL%" --window-size=1600,960 --window-position=100,50 --disable-extensions --no-first-run
    goto :done
)
if exist "%EDGE_SYS%" (
    start "" "%EDGE_SYS%" --app="%FILE_URL%" --window-size=1600,960 --window-position=100,50 --no-first-run
    goto :done
)
if exist "%EDGE_64%" (
    start "" "%EDGE_64%" --app="%FILE_URL%" --window-size=1600,960 --window-position=100,50 --no-first-run
    goto :done
)

echo  Khong tim thay Chrome/Edge. Mo bang trinh duyet mac dinh...
start "" "%FILE_URL%"

:done
timeout /t 1 /nobreak >nul
exit
