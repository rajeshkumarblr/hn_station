# scripts/build.ps1
# Build script for HN Station

Write-Host "--- HN Station Build Script ---" -ForegroundColor Cyan

# 1. Build Backend
Write-Host "Building Go Backend..." -ForegroundColor Yellow
if (!(Test-Path "bin")) { New-Item -ItemType Directory -Path "bin" }
go build -o bin/hn-backend.exe ./cmd/local/main.go
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend build failed!" -ForegroundColor Red
    exit 1
}

# 2. Build Frontend
Write-Host "Building React Frontend..." -ForegroundColor Yellow
Set-Location web
npm install
npm run build
Set-Location ..

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build Successful! Binaries are in bin/" -ForegroundColor Green
