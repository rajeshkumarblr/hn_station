#!/bin/bash
# release.sh — Unified Release Script for HN Station (Web + Desktop)
# Usage: ./scripts/release.sh

set -e

echo "🚀 Starting Unified Release Process (v1.9.0)..."

# 1. Build Local Go Backend
echo -e "\n1. Building Local Go Backend (hn-local.exe)..."
go build -o web/resources/hn-local.exe ./cmd/local

# 2. Deploy to Web (AKS)
echo -e "\n2. Deploying to Web (AKS)..."
./infrastructure/deploy_aks.sh

# 3. Build & Package Electron App
echo -e "\n3. Building & Packaging Electron App (Desktop)..."
cd web
npm run build:win
cd ..

echo -e "\n✨ Unified Release Complete!"
echo "Web: Check https://hnstation.dev"
echo "Desktop: Installer ready at web/release/HN Station Setup 1.9.0.exe"
