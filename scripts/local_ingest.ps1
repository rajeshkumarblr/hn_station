# HN Station Local Ingestion Script (Windows/PowerShell)
# This script triggers a one-shot ingestion run using a port-forwarded database tunnel.

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ROOT = Resolve-Path "$PSScriptRoot\.."
$BINARY_PATH = Join-Path $PROJECT_ROOT "bin\ingest.exe"
$PORT_FORWARD_PORT = 5433
$PORT_FORWARD_TARGET = "svc/postgres:5432"
$LOG_FILE = Join-Path $PROJECT_ROOT "logs\ingest.log"
$LOCK_FILE = Join-Path $env:TEMP "hn_ingest.lock"

# Ensure directories exist
if (!(Test-Path (Join-Path $PROJECT_ROOT "bin"))) { New-Item -ItemType Directory -Path (Join-Path $PROJECT_ROOT "bin") }
if (!(Test-Path (Join-Path $PROJECT_ROOT "logs"))) { New-Item -ItemType Directory -Path (Join-Path $PROJECT_ROOT "logs") }

# Simple lock mechanism using a file
if (Test-Path $LOCK_FILE) {
    Write-Host "Lock file exists ($LOCK_FILE). Checking if another process is running..."
    # In a real scenario, we might check process list, but for now we just warn
    # Remove-Item $LOCK_FILE # Be careful with this
}
New-Item -ItemType File -Path $LOCK_FILE -Force | Out-Null

try {
    Write-Host "[$(Get-Date)] Starting local ingestion..." | Out-File -FilePath $LOG_FILE -Append

    # 1. Start port-forward in background
    Write-Host "Opening tunnel to Postgres..."
    $pfProcess = Start-Process kubectl -ArgumentList "port-forward", $PORT_FORWARD_TARGET, "${PORT_FORWARD_PORT}:5432" -NoNewWindow -PassThru

    # Wait for tunnel to be ready
    Start-Sleep -Seconds 8

    # 2. Run ingestion
    Write-Host "Running ingest.exe..."
    Set-Location $PROJECT_ROOT
    & $BINARY_PATH --one-shot 2>&1 | Out-File -FilePath $LOG_FILE -Append

    # 3. Cleanup
    Stop-Process -Id $pfProcess.Id -Force
    Write-Host "[$(Get-Date)] Ingestion completed." | Out-File -FilePath $LOG_FILE -Append
}
finally {
    if (Test-Path $LOCK_FILE) { Remove-Item $LOCK_FILE }
}
