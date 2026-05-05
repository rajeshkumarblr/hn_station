# desktop_release.ps1 — Desktop-only Release Script for HN Station
# Usage: .\scripts\desktop_release.ps1
$VERSION = "0.10.0"
Write-Host "🚀 Starting CLEAN Desktop Release Process (v$VERSION)..." -ForegroundColor Cyan

# 0. Cleanup old build artifacts
Write-Host "`n0. Cleaning old build artifacts (dist/)..." -ForegroundColor Yellow
if (Test-Path "web/dist") { Remove-Item -Recurse -Force "web/dist" }
if (Test-Path "web/dist-electron") { Remove-Item -Recurse -Force "web/dist-electron" }
if (Test-Path "web/release") { Remove-Item -Recurse -Force "web/release" }
Write-Host "`n1. Building Local Go Backend (hn-local.exe)..." -ForegroundColor Yellow
go build -o web/resources/hn-local.exe ./cmd/local
if ($LASTEXITCODE -ne 0) { Write-Error "Go build failed"; exit $LASTEXITCODE }

# 2. Build & Package Electron App
Write-Host "`n2. Building & Packaging Electron App (Desktop)..." -ForegroundColor Yellow
Set-Location web
npm run build:win
if ($LASTEXITCODE -ne 0) { Write-Error "Electron build failed"; exit $LASTEXITCODE }
Set-Location ..

Write-Host "`n✨ Desktop Release Complete!" -ForegroundColor Green
Write-Host "Desktop: Installer ready at web/release/HN Station Setup $VERSION.exe"

# 3. Create GitHub Release
Write-Host "`n3. Creating GitHub Release (v$VERSION)..." -ForegroundColor Yellow
gh release create v$VERSION "web/release/HN Station Setup $VERSION.exe" --title "Hacker News Station v$VERSION (Desktop)" --notes "Unified FTS discovery, Enhanced AI Sidebar topics, and Precision Article View controls."
if ($LASTEXITCODE -ne 0) { Write-Warning "GitHub release failed (is gh authenticated?)" }
