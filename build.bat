@echo off
echo ========================================
echo Build do GC Chatbot
echo ========================================
echo.

echo Executando build do Vite...
powershell -ExecutionPolicy Bypass -Command "npm run build"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Build concluído com sucesso!
    echo ========================================
    echo.
    echo Os arquivos estão na pasta 'dist'
    echo Você pode fazer deploy dessa pasta em qualquer serviço de hospedagem.
    echo.
) else (
    echo.
    echo ========================================
    echo Erro durante o build!
    echo ========================================
    echo.
)

pause
