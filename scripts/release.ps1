# release.ps1 — Unified Release Script for HN Station (Web + Desktop)
# Usage: .\scripts\release.ps1
$VERSION = "1.0.0-rc15"
Write-Host "🚀 Starting Unified Release Process (v$VERSION)..." -ForegroundColor Cyan

# 1. Build Local Go Backend
Write-Host "`n1. Building Local Go Backend (hn-local.exe)..." -ForegroundColor Yellow
go build -o web/resources/hn-local.exe ./cmd/local
if ($LASTEXITCODE -ne 0) { Write-Error "Go build failed"; exit $LASTEXITCODE }

# 2. Deploy to Web (AKS)
Write-Host "`n2. Deploying to Web (AKS)..." -ForegroundColor Yellow
# Since this is a PS1 script, call the companion deployment script
powershell -ExecutionPolicy Bypass -File .\infrastructure\deploy_aks.ps1
if ($LASTEXITCODE -ne 0) { Write-Error "AKS Deployment failed"; exit $LASTEXITCODE }


# 3. Build & Package Electron App
Write-Host "`n3. Building & Packaging Electron App (Desktop)..." -ForegroundColor Yellow
Set-Location web
npm run build:win
if ($LASTEXITCODE -ne 0) { Write-Error "Electron build failed"; exit $LASTEXITCODE }
Set-Location ..

Write-Host "`n✨ Unified Release Complete!" -ForegroundColor Green
Write-Host "Web: Check https://hnstation.dev"
Write-Host "Desktop: Installer ready at web/release/HN Station Setup $VERSION.exe"

# 4. Create GitHub Release
Write-Host "`n4. Creating GitHub Release (v$VERSION)..." -ForegroundColor Yellow
gh release create v$VERSION "web/release/HN Station Setup $VERSION.exe" --title "Hacker News Station v$VERSION" --notes "Reverting triple-sync AI summary functionality."
if ($LASTEXITCODE -ne 0) { Write-Warning "GitHub release failed (is gh authenticated?)" }
