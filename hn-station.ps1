# hn-station.ps1 - Launcher for HN Station Local on Windows
# Usage: .\hn-station.ps1

$ErrorActionPreference = "Stop"

# Use the smart incremental builder
& ".\build.ps1"

$EXE_PATH = "web\dist\win-unpacked\HN Station.exe"

if (Test-Path $EXE_PATH) {
    Write-Host "Starting HN Station..." -ForegroundColor Cyan
    Start-Process $EXE_PATH
} else {
    Write-Error "Failed to locate branded EXE at $EXE_PATH after build."
}
