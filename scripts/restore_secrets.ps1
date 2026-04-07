# scripts/restore_secrets.ps1 — Restore missing Google OAuth and JWT secrets to Azure Key Vault
# Usage: .\scripts\restore_secrets.ps1

if (-not (Test-Path ".kv_env")) {
    Write-Error "Error: .kv_env not found. Run infrastructure setup first."
    exit 1
}

# 1. Load KV Name
$KV_NAME = (Get-Content ".kv_env" | Select-String "KV_NAME=").ToString().Split("=")[1]
Write-Host "Using Key Vault: $KV_NAME" -ForegroundColor Cyan

# 2. Prompt for missing secrets
$clientId = Read-Host "Enter GOOGLE_CLIENT_ID"
$clientSecret = Read-Host "Enter GOOGLE_CLIENT_SECRET"
$jwtSecret = Read-Host "Enter JWT_SECRET (random string for session signing)"

if ([string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret) -or [string]::IsNullOrWhiteSpace($jwtSecret)) {
    Write-Error "All values are required."
    exit 1
}

# 3. Upload to Key Vault
Write-Host "`nUploading secrets to Azure..." -ForegroundColor Yellow
az keyvault secret set --vault-name $KV_NAME --name "google-client-id" --value $clientId > $null
az keyvault secret set --vault-name $KV_NAME --name "google-client-secret" --value $clientSecret > $null
az keyvault secret set --vault-name $KV_NAME --name "jwt-secret" --value $jwtSecret > $null

Write-Host "Secrets uploaded successfully." -ForegroundColor Green

# 4. Apply K8s changes
Write-Host "`nApplying SecretProviderClass update..." -ForegroundColor Yellow
kubectl apply -f infrastructure/k8s/secret-provider.yaml

Write-Host "Restarting backend to apply new secrets..." -ForegroundColor Yellow
kubectl rollout restart deployment/backend

Write-Host "`n✨ Restore Complete! Check https://hnstation.dev/auth/google to verify." -ForegroundColor Green
