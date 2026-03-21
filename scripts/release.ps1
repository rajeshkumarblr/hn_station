# release.ps1 — Unified Release Script for HN Station (Web + Desktop)
# Usage: .\scripts\release.ps1

Write-Host "🚀 Starting Unified Release Process (v1.7.3)..." -ForegroundColor Cyan

# 1. Build Local Go Backend
Write-Host "`n1. Building Local Go Backend (hn-local.exe)..." -ForegroundColor Yellow
go build -o web/resources/hn-local.exe ./cmd/local
if ($LASTEXITCODE -ne 0) { Write-Error "Go build failed"; exit $LASTEXITCODE }

# 2. Deploy to Web (AKS)
Write-Host "`n2. Deploying to Web (AKS)..." -ForegroundColor Yellow
# Using the existing bash script via bash (if available in MINGW/Git Bash context) or executing commands directly.
# Since this is a PS1 script, we'll try to run the bash script if bash is in path.
bash ./infrastructure/deploy_aks.sh
if ($LASTEXITCODE -ne 0) { Write-Error "AKS Deployment failed"; exit $LASTEXITCODE }

# 3. Build & Package Electron App
Write-Host "`n3. Building & Packaging Electron App (Desktop)..." -ForegroundColor Yellow
Set-Location web
npm run build:win
if ($LASTEXITCODE -ne 0) { Write-Error "Electron build failed"; exit $LASTEXITCODE }
Set-Location ..

Write-Host "`n✨ Unified Release Complete!" -ForegroundColor Green
Write-Host "Web: Check https://hnstation.dev"
Write-Host "Desktop: Installer ready at web/release/HN Station Setup 1.1.0.exe"
