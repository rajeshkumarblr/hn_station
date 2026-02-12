#!/bin/bash
set -e

# Configuration
ACR_NAME="myhnregistry31509"
ACR_SERVER="${ACR_NAME}.azurecr.io"

echo "1. Logging into ACR..."
az acr login --name $ACR_NAME

echo "2. Building and Pushing Backend..."
docker build -t $ACR_SERVER/backend:latest -f Dockerfile.backend .
docker push $ACR_SERVER/backend:latest

echo "3. Building and Pushing Frontend..."
docker build -t $ACR_SERVER/frontend:latest -f web/Dockerfile ./web
docker push $ACR_SERVER/frontend:latest

echo "4. Deploying to AKS..."

# Apply Secrets (Ensure you've edited infrastructure/k8s/secrets.yaml if needed)
kubectl apply -f infrastructure/k8s/secrets.yaml

# Apply Database (StatefulSet)
echo "Deploying Postgres..."
kubectl apply -f infrastructure/k8s/postgres.yaml

# Wait for Postgres (optional check, or just proceed)
echo "Deploying Backend, Frontend, and Ingestion..."
kubectl apply -f infrastructure/k8s/backend.yaml
kubectl apply -f infrastructure/k8s/frontend.yaml
kubectl apply -f infrastructure/k8s/ingest.yaml

echo "Deploying Ingress and TLS..."
kubectl apply -f infrastructure/k8s/production-issuer.yaml
kubectl apply -f infrastructure/k8s/ingress.yaml

echo "--------------------------------------------------"
echo "Deployment triggered!"
echo "Check status with: kubectl get pods"
echo "Watch for External IP: kubectl get svc frontend -w"
