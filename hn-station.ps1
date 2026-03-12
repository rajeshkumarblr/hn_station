# hn-station.ps1 - Launcher for HN Station Local on Windows
# Usage: .\hn-station.ps1

$ErrorActionPreference = "Stop"

Write-Host "Starting HN Station on Windows..." -ForegroundColor Cyan

# 1. Build the local backend
Write-Host "Building local backend (hn-local.exe)..." -ForegroundColor Yellow
if (Test-Path "web\resources\hn-local.exe") {
    Remove-Item "web\resources\hn-local.exe" -Force
}
go build -o web\resources\hn-local.exe .\cmd\local

# 2. Start the application
Set-Location web

if ($args -contains "-Build") {
    Write-Host "Cleaning stale builds..." -ForegroundColor Yellow
    if (Test-Path "web\dist") { Remove-Item "web\dist" -Recurse -Force }
    if (Test-Path "web\dist-electron") { Remove-Item "web\dist-electron" -Recurse -Force }
    
    Write-Host "Building branded executable (this may take a minute)..." -ForegroundColor Yellow
    npm run build:dir
    Write-Host "Done! Branded EXE created at: web\dist\win-unpacked\HN Station.exe" -ForegroundColor Green
    Write-Host "Tip: Run that EXE and pin it to your taskbar for the correct icon." -ForegroundColor Cyan
    exit
}

Write-Host "Launching Electron..." -ForegroundColor Yellow
npm run dev
