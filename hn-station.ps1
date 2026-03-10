# hn-station.ps1 - Launcher for HN Station Local on Windows
# Usage: .\hn-station.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting HN Station on Windows..." -ForegroundColor Cyan

# 1. Build the local backend
Write-Host "📦 Building local backend (hn-local.exe)..." -ForegroundColor Yellow
if (Test-Path "web\resources\hn-local.exe") {
    Remove-Item "web\resources\hn-local.exe" -Force
}
go build -o web\resources\hn-local.exe .\cmd\local

# 2. Start the application
Set-Location web
Write-Host "🖥️  Launching Electron..." -ForegroundColor Yellow
npm run dev
