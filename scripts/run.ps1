# scripts/run.ps1
# Run script for HN Station

Write-Host "--- Starting HN Station ---" -ForegroundColor Cyan

# 1. Start Backend in a new window
Write-Host "Starting Backend on port 58090..." -ForegroundColor Yellow
if (!(Test-Path "bin/hn-backend.exe")) {
    Write-Host "Backend binary not found. Running build first..."
    & ./scripts/build.ps1
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& ./bin/hn-backend.exe -port 58090"

# 2. Start Frontend (Electron + Vite)
Write-Host "Starting Frontend (Electron + Vite)..." -ForegroundColor Yellow
Set-Location web
$env:VITE_ELECTRON = "true"
npm run dev
