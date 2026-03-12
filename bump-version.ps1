# bump-version.ps1 - Increments the minor version in DesktopLayout.tsx
$ROOT = $PSScriptRoot
$TARGET_FILE = "$ROOT\web\src\layouts\DesktopLayout.tsx"

if (-not (Test-Path $TARGET_FILE)) {
    Write-Error "Could not find $TARGET_FILE"
    exit 1
}

$content = Get-Content $TARGET_FILE -Raw
# Regex to find version like v4.37
$regex = 'v(\d+)\.(\d+)'
$match = [regex]::Match($content, $regex)

if ($match.Success) {
    $major = [int]$match.Groups[1].Value
    $minor = [int]$match.Groups[2].Value
    $newMinor = $minor + 1
    $newVersion = "v$major.$newMinor"
    
    $newContent = $content -replace $regex, $newVersion
    Set-Content $TARGET_FILE $newContent -NoNewline
    Write-Host "✅ Version bumped: $match.Value -> $newVersion" -ForegroundColor Green
} else {
    Write-Warning "Could not find version string in $TARGET_FILE"
}
