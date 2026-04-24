# scripts/start-desktop.ps1 - Build and run HN Station as a Desktop Electron App
$ErrorActionPreference = "Continue"

Write-Host "Cleaning up old processes..."
taskkill /F /IM "hn-local.exe" /T 2>$null
taskkill /F /IM "hn-backend.exe" /T 2>$null
taskkill /F /IM "HN Station.exe" /T 2>$null
taskkill /F /IM "electron.exe" /T 2>$null

Write-Host "Building Backend..."
if (-not (Test-Path "web/resources")) { 
    New-Item -ItemType Directory "web/resources" -Force
}

go build -o web/resources/hn-local.exe ./cmd/local
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Backend build failed"
    exit $LASTEXITCODE 
}

Write-Host "Launching Desktop App..."
$env:VITE_ELECTRON = "true"

Set-Location web
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
}

npm run dev
Set-Location ..
