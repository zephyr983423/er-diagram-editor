@echo off
REM Script de lancement automatique pour Windows

set PORT=8000
set URL=http://localhost:%PORT%/index.html

echo Lancement de l'editeur E-A...
echo.

REM Tester Node.js / npx
where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Node.js detecte - Utilisation de http-server
    start "" %URL%
    npx http-server -p %PORT% -c-1
    exit /b 0
)

REM Tester PHP
where php >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo PHP detecte - Utilisation du serveur integre
    start "" %URL%
    php -S localhost:%PORT%
    exit /b 0
)

REM Tester Python
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Python detecte - Utilisation du serveur HTTP
    start "" %URL%
    python -m http.server %PORT%
    exit /b 0
)

REM Aucun serveur trouve
echo Aucun serveur HTTP trouve!
echo.
echo Veuillez installer l'un des suivants:
echo   - Node.js: https://nodejs.org/
echo   - PHP: https://www.php.net/downloads
echo   - Python: https://www.python.org/downloads/
echo.
echo Ou utilisez l'extension 'Live Server' dans VS Code (recommande)
pause
exit /b 1
