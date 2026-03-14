@echo off
cd web
call npx vite build --clearScreen false > build_full.log 2>&1
echo Build finished with exit code %errorlevel% >> build_full.log
