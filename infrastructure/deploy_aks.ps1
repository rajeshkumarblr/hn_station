# HN Station AKS Deployment Script (Windows/PowerShell)
# This script builds, pushes, and deploys the HN Station application to AKS.

$ErrorActionPreference = "Stop"

# Configuration
$ACR_NAME = "myhnregistry270"
$ACR_SERVER = "${ACR_NAME}.azurecr.io"

Write-Host "1. Logging into ACR..." -ForegroundColor Cyan
az acr login --name $ACR_NAME

Write-Host "2. Building and Pushing Backend..." -ForegroundColor Cyan
docker build --no-cache -t "${ACR_SERVER}/backend:latest" -f Dockerfile.backend .
docker push "${ACR_SERVER}/backend:latest"

Write-Host "3. Deploying to AKS..." -ForegroundColor Cyan

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

Write-Host "Deploying SECRETS, Backend, and Ingestion..."
kubectl apply -f infrastructure/k8s/secret-provider.yaml
kubectl apply -f infrastructure/k8s/backend.yaml
kubectl apply -f infrastructure/k8s/ingest.yaml

Write-Host "Deploying Ingress and TLS..."
kubectl apply -f infrastructure/k8s/production-issuer.yaml
kubectl apply -f infrastructure/k8s/ingress.yaml

Write-Host "Restarting Backend and Ingestion to apply new images..." -ForegroundColor Cyan
kubectl rollout restart deployment/backend
kubectl rollout restart deployment/ingest

Write-Host "--------------------------------------------------" -ForegroundColor Green
Write-Host "Deployment triggered!" -ForegroundColor Green
Write-Host "Check status with: kubectl get pods"
Write-Host "Watch for External IP: kubectl get ingress -w"
