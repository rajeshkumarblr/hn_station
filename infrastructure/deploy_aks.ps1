# HN Station AKS Deployment Script (Windows/PowerShell)
# This script builds, pushes, and deploys the HN Station application to AKS.

$ErrorActionPreference = "Stop"

# Configuration
$ACR_NAME = "myhnregistry270"
$ACR_SERVER = "${ACR_NAME}.azurecr.io"

Write-Host "1. Logging into ACR..." -ForegroundColor Cyan
docker system prune -af
if ($LASTEXITCODE -ne 0) { Write-Host "Docker prune failed but continuing..." -ForegroundColor Yellow }

Write-Host "Retrieving ACR Refresh Token..." -ForegroundColor Cyan
$token = (az acr login --name $ACR_NAME --expose-token --output tsv --query accessToken)
if ($LASTEXITCODE -ne 0) { throw "Retrieving ACR Token failed" }

Write-Host "Logging into Docker Registry..." -ForegroundColor Cyan
$token | docker login $ACR_SERVER -u "00000000-0000-0000-0000-000000000000" --password-stdin
if ($LASTEXITCODE -ne 0) { throw "ACR Docker login failed" }

Write-Host "2. Building and Pushing Backend..." -ForegroundColor Cyan
docker build --no-cache --pull -t "${ACR_SERVER}/backend:latest" -f Dockerfile.backend .
if ($LASTEXITCODE -ne 0) { throw "Docker build backend failed" }
docker push "${ACR_SERVER}/backend:latest"
if ($LASTEXITCODE -ne 0) { throw "Docker push backend failed" }

Write-Host "3. Building and Pushing Frontend..." -ForegroundColor Cyan
docker build --no-cache --pull -t "${ACR_SERVER}/frontend:latest" -f web/Dockerfile ./web
if ($LASTEXITCODE -ne 0) { throw "Docker build frontend failed" }
docker push "${ACR_SERVER}/frontend:latest"
if ($LASTEXITCODE -ne 0) { throw "Docker push frontend failed" }

Write-Host "4. Deploying to AKS..." -ForegroundColor Cyan

# Apply Secrets (Optional)
if (Test-Path "infrastructure/k8s/secrets.yaml") {
    Write-Host "Applying Secrets..."
    kubectl apply -f infrastructure/k8s/secrets.yaml
}
else {
    Write-Host "Skipping secrets.yaml (file not found)..." -ForegroundColor Yellow
}

# Apply Database (StatefulSet)
Write-Host "Deploying Postgres..."
kubectl apply -f infrastructure/k8s/postgres.yaml

Write-Host "Deploying SECRETS, Backend, Frontend, and Ingestion..."
kubectl apply -f infrastructure/k8s/secret-provider.yaml
kubectl apply -f infrastructure/k8s/backend.yaml
kubectl apply -f infrastructure/k8s/frontend_deploy.yaml
kubectl apply -f infrastructure/k8s/ingest.yaml

Write-Host "Deploying Ingress and TLS..."
kubectl apply -f infrastructure/k8s/production-issuer.yaml
kubectl apply -f infrastructure/k8s/ingress.yaml

Write-Host "Restarting Backend, Frontend, and Ingestion to apply new images..." -ForegroundColor Cyan
kubectl rollout restart deployment/backend
kubectl rollout restart deployment/frontend
kubectl rollout restart deployment/ingest

Write-Host "--------------------------------------------------" -ForegroundColor Green
Write-Host "Deployment triggered!" -ForegroundColor Green
Write-Host "Check status with: kubectl get pods"
Write-Host "Watch for External IP: kubectl get ingress -w"
