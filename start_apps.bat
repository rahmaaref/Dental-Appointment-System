@echo off
echo Starting Dental Appointment System...
echo.

echo Starting Patient App (Port 5000)...
start "Patient App" cmd /k "cd /d %~dp0 && python app_patient.py"

echo Starting Staff App (Port 5001)...
start "Staff App" cmd /k "cd /d %~dp0 && python app_staff.py"

echo Starting Frontend Development Servers...
start "Frontend Dev" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo All applications are starting...
echo Patient App: http://localhost:5000
echo Staff App: http://localhost:5001
echo.
echo Press any key to exit...
pause > nul
