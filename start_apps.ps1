Write-Host "Starting Dental Appointment System..." -ForegroundColor Green
Write-Host ""

Write-Host "Starting Patient App (Port 5000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; python app_patient.py" -WindowStyle Normal

Write-Host "Starting Staff App (Port 5001)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; python app_staff.py" -WindowStyle Normal

Write-Host "Starting Frontend Development Servers..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "All applications are starting..." -ForegroundColor Green
Write-Host "Patient App: http://localhost:5000" -ForegroundColor White
Write-Host "Staff App: http://localhost:5001" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
