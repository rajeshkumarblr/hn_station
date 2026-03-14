$ErrorActionPreference = "Continue"
$ROOT = $PSScriptRoot

Write-Host "--- HN Station Installer Builder ---" -ForegroundColor Cyan

# 0. Cleanup
Write-Host "`n[0/3] Cleaning up old build artifacts..." -ForegroundColor Yellow
taskkill /F /IM node.exe /T 2>$null
taskkill /F /IM "HN Station.exe" /T 2>$null
taskkill /F /IM electron.exe /T 2>$null
taskkill /F /IM hn-local.exe /T 2>$null

if (Test-Path "$ROOT\web\dist") { Remove-Item -Recurse -Force "$ROOT\web\dist" -ErrorAction SilentlyContinue }
if (Test-Path "$ROOT\web\dist-electron") { Remove-Item -Recurse -Force "$ROOT\web\dist-electron" -ErrorAction SilentlyContinue }
if (Test-Path "$ROOT\web\release") { Remove-Item -Recurse -Force "$ROOT\web\release" -ErrorAction SilentlyContinue }

$ErrorActionPreference = "Stop"

# 1. Build Backend
Write-Host "`n[1/3] Building Go backend (Windows x64)..." -ForegroundColor Yellow
if (-not (Test-Path "$ROOT\web\resources")) { New-Item -ItemType Directory -Path "$ROOT\web\resources" }
Push-Location $ROOT
go build -o web\resources\hn-local.exe ./cmd/local
Pop-Location

# 2. Build Frontend & Main Process (Vite)
Write-Host "`n[2/4] Building Frontend & Main Process..." -ForegroundColor Yellow
Push-Location "$ROOT\web"
npm run build

# 2.5 Fix Preload Script (Force CommonJS)
Write-Host "`n[2.5/4] Forcing CommonJS format for preload script..." -ForegroundColor Yellow
$ESBUILD = "$ROOT\web\node_modules\.bin\esbuild.cmd"
if (-not (Test-Path $ESBUILD)) { $ESBUILD = "esbuild" }
& $ESBUILD "$ROOT\web\electron\preload.ts" --bundle --platform=node --format=cjs --outfile="$ROOT\web\dist-electron\preload.js" --external:electron

# 2.6 Generate Installer (Electron-Builder)
Write-Host "`n[2.6/4] Generating Installer (NSIS)..." -ForegroundColor Yellow
npx electron-builder --win
Pop-Location

# 3. Locate Result
Write-Host "`n[3/3] Locating installer in release/..." -ForegroundColor Yellow
$INSTALLER = Get-ChildItem -Path "$ROOT\web\release" -Filter "HN Station Setup *.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($INSTALLER) {
    Write-Host "`nSuccess! Installer generated at:" -ForegroundColor Green
    Write-Host $INSTALLER.FullName -ForegroundColor White
    Write-Host "`nYou can share this file with anyone on Windows." -ForegroundColor Gray
}
else {
    Write-Error "Failed to locate the generated installer in web\release"
}
