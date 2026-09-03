@echo off
cd /d "%~dp0\server"
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000/html/login.html"
call npx nodemon index.js
pause
