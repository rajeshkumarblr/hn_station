param(
    [switch]$BumpVersion
)

$ErrorActionPreference = "Stop"

# Use the smart incremental builder
if ($BumpVersion) {
    & ".\build.ps1" -BumpVersion
} else {
    & ".\build.ps1"
}

$EXE_PATH = "web\dist\win-unpacked\HN Station.exe"

if (Test-Path $EXE_PATH) {
    Write-Host "Starting HN Station..." -ForegroundColor Cyan
    Start-Process $EXE_PATH
} else {
    Write-Error "Failed to locate branded EXE at $EXE_PATH after build."
}
