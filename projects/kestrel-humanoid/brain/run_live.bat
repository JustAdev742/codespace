@echo off
rem KESTREL live on Windows: sets up a virtual environment the first time, then starts the house and opens
rem your browser at http://localhost:8765. Extra arguments go to live.py (for example: run_live.bat --claude).
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
  .venv\Scripts\pip install -r requirements-live.txt
)
start "" cmd /c "timeout /t 12 >nul & start http://localhost:8765"
.venv\Scripts\python live.py %*
