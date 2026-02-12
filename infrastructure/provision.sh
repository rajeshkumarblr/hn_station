#!/bin/bash
set -e

# Configuration
RG_NAME="my-hn-rg"
LOCATION="eastus2"
AKS_CLUSTER_NAME="my-hn-cluster"
ACR_NAME="myhnregistry$RANDOM" # Random suffix to ensure uniqueness

echo "Starting Infrastructure Provisioning..."

# 1. Create Resource Group
echo "Creating Resource Group: $RG_NAME in $LOCATION..."
az group create --name $RG_NAME --location $LOCATION

# 2. Create Azure Container Registry (ACR)
echo "Creating ACR: $ACR_NAME..."
az acr create --resource-group $RG_NAME --name $ACR_NAME --sku Basic

# 3. Create or Update AKS Cluster
# - Tier: Free (Cluster Management)
# - Node Count: 2
# - Node VM Size: Standard_B2s (Burstable, cost-effective)
echo "Checking if AKS Cluster $AKS_CLUSTER_NAME exists..."

if az aks show --resource-group $RG_NAME --name $AKS_CLUSTER_NAME &>/dev/null; then
    echo "Cluster exists. Updating to ensure ACR attachment..."
    az aks update \
        --resource-group $RG_NAME \
        --name $AKS_CLUSTER_NAME \
        --attach-acr $ACR_NAME
else
    echo "Cluster does not exist. Creating..."
    az aks create \
        --resource-group $RG_NAME \
        --name $AKS_CLUSTER_NAME \
        --node-count 2 \
        --node-vm-size Standard_B2s \
        --tier free \
        --generate-ssh-keys \
        --attach-acr $ACR_NAME
fi

# 4. Get Credentials
echo "Getting AKS Credentials..."
az aks get-credentials --resource-group $RG_NAME --name $AKS_CLUSTER_NAME --overwrite-existing

echo "Infrastructure Provisioning Complete!"
echo "ACR Name: $ACR_NAME"
echo "Login Server: $(az acr show --name $ACR_NAME --query loginServer --output tsv)"
