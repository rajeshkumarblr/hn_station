# restart.ps1 — Rapid Development Script for HN Station
# Usage: .\scripts\restart.ps1
$VERSION = "1.0.0-rc26"
Write-Host "🚀 Restarting HN Station v$VERSION (Rapid Dev Mode)..." -ForegroundColor Cyan

# 1. Force kill existing processes
Write-Host "`n1. Stopping existing app instances..." -ForegroundColor Yellow
Stop-Process -Name "HN Station", "hn-local", "electron" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. Rebuild Local Go Backend
Write-Host "`n2. Rebuilding Go Backend (hn-local.exe)..." -ForegroundColor Yellow
go build -o web/resources/hn-local.exe ./cmd/local
if ($LASTEXITCODE -ne 0) { Write-Error "Go build failed"; exit $LASTEXITCODE }

# 3. Clean & Build Web Assets
Write-Host "`n3. Building Web Assets (Clean Build + Electron Mode)..." -ForegroundColor Yellow
Set-Location web
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "dist-electron") { Remove-Item -Recurse -Force "dist-electron" }
$env:VITE_ELECTRON = "true"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Vite build failed"; exit $LASTEXITCODE }

# 4. Package Unpacked Directory (Fast)
Write-Host "`n4. Packaging Unpacked Executable (Fast)..." -ForegroundColor Yellow
npx electron-builder --win --dir
if ($LASTEXITCODE -ne 0) { Write-Error "Electron packaging failed"; exit $LASTEXITCODE }

# 5. Launch
Write-Host "`n✨ Launching HN Station rc26!" -ForegroundColor Green
$exePath = "release\win-unpacked\HN Station.exe"
if (Test-Path $exePath) {
    Start-Process $exePath
} else {
    Write-Error "Executable not found at $exePath"
}
Set-Location ..
