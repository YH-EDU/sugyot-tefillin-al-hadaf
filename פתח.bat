@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo פותח את סוגיות התפילין על הדף...
python serve.py
pause
