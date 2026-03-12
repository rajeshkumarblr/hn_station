param(
    [switch]$BumpVersion
)

$ROOT = $PSScriptRoot

if ($BumpVersion) {
    Write-Host "Bumping version..." -ForegroundColor Yellow
    & ".\bump-version.ps1"
}

$EXE_PATH = "$ROOT\web\dist\win-unpacked\HN Station.exe"
$BACKEND_EXE = "$ROOT\web\resources\hn-local.exe"
$FRONTEND_DIST = "$ROOT\web\dist"

# Helper to check if any child files in a directory are newer than a target file
function Test-IsNewer($Directory, $TargetFile) {
    if (-not (Test-Path $TargetFile)) { return $true }
    $targetTime = (Get-Item $TargetFile).LastWriteTime
    $newestChild = Get-ChildItem -Path $Directory -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $newestChild) { return $false }
    return $newestChild.LastWriteTime -gt $targetTime
}

Write-Host "Checking dependencies..." -ForegroundColor Cyan

$backendNeedsBuild = Test-IsNewer "$ROOT\internal" $BACKEND_EXE -or Test-IsNewer "$ROOT\cmd" $BACKEND_EXE
if ($backendNeedsBuild) {
    Write-Host "Rebuilding Go backend..." -ForegroundColor Yellow
    pushd $ROOT
    if (-not (Test-Path "$ROOT\web\resources")) { New-Item -ItemType Directory -Path "$ROOT\web\resources" }
    go build -o web\resources\hn-local.exe ./cmd/local
    popd
} else {
    Write-Host "Backend is up to date." -ForegroundColor Green
}

$frontendNeedsBuild = Test-IsNewer "$ROOT\web\src" $FRONTEND_DIST -or (Test-Path "$ROOT\web\src\components\FilterSidebar.tsx" -and (Get-Item "$ROOT\web\src\components\FilterSidebar.tsx").LastWriteTime -gt (Get-Item $FRONTEND_DIST).LastWriteTime)

# We also check the main.ts for Electron changes
$electronNeedsBuild = Test-IsNewer "$ROOT\web\electron\main.ts" $EXE_PATH

if ($frontendNeedsBuild -or $electronNeedsBuild -or (-not (Test-Path $EXE_PATH))) {
    Write-Host "Rebuilding Branded Executable (Changes detected)..." -ForegroundColor Yellow
    pushd "$ROOT\web"
    # Ensure dist is fresh
    if (Test-Path "$ROOT\web\dist") { Remove-Item -Recurse -Force "$ROOT\web\dist" }
    npm run build:dir
    popd
} else {
    Write-Host "Branded EXE is up to date." -ForegroundColor Green
}

Write-Host "`nReady! Launching using $EXE_PATH" -ForegroundColor Gray
