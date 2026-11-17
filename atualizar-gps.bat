@echo off
setlocal
set "PATH=%LOCALAPPDATA%\MinGit\cmd;%LOCALAPPDATA%\gh;%SystemRoot%\System32;%PATH%"
cd /d "%~dp0"

echo.
echo ========================================================
echo        VELOX GPS - PUBLICACAO E ATUALIZACAO AUTOMATICA
echo ========================================================
echo.
echo [1/2] Registrando melhorias no codigo...
git add .
git diff-index --quiet HEAD || git commit -m "Atualizacao automatica do Velox GPS"

echo [2/2] Enviando para a nuvem...
git push origin main

echo.
echo ========================================================
echo  TUDO PRONTO! O Velox GPS foi atualizado na nuvem!
echo  Em poucos segundos a nova versao estara ativa em todos os celulares.
echo ========================================================
echo.
pause
