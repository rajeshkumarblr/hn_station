Stop-Service -Name "HNStationIngest" -Force
Copy-Item "c:\Users\rajes\proj\hn_station\web\resources\hn-local.exe" -Destination "C:\Program Files\HN Station\resources\hn-local.exe" -Force
Start-Service -Name "HNStationIngest"
Write-Host "Service patched and restarted successfully! You can close this window now." -ForegroundColor Green
Start-Sleep -Seconds 3
