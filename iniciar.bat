@echo off
cd /d "%~dp0\server"
call npx nodemon index.js
pause
