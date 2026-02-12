#!/bin/bash
set -e

# Configuration
RG_NAME="my-hn-rg"
LOCATION="eastus2"
AKS_CLUSTER_NAME="my-hn-cluster"
KV_NAME="my-hn-kv-$RANDOM" # Unique name
IDENTITY_NAME="my-hn-kv-identity"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

echo "Starting Key Vault Setup..."

# 1. Create Key Vault
echo "Creating Key Vault: $KV_NAME..."
az keyvault create --resource-group $RG_NAME --location $LOCATION --name $KV_NAME --enable-rbac-authorization

# 1.5 Assign Current User as Key Vault Secrets Officer
echo "Assigning current user as Key Vault Secrets Officer..."
CURRENT_USER_ID=$(az ad signed-in-user show --query id -o tsv)
az role assignment create --role "Key Vault Secrets Officer" --assignee $CURRENT_USER_ID --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_NAME/providers/Microsoft.KeyVault/vaults/$KV_NAME"

# 2. Add Secrets
echo "Adding secrets to Key Vault..."
# Generate a real random password
DB_PASSWORD=$(openssl rand -base64 16)
DB_URL="postgres://hn_user:${DB_PASSWORD}@postgres:5432/my_hn?sslmode=disable"

az keyvault secret set --vault-name $KV_NAME --name "db-password" --value "$DB_PASSWORD" >/dev/null
az keyvault secret set --vault-name $KV_NAME --name "db-url" --value "$DB_URL" >/dev/null
echo "Secrets 'db-password' and 'db-url' added."

# 3. Enable Secrets Store CSI Driver
echo "Enabling Secrets Store CSI Driver on AKS..."
if az aks show --resource-group $RG_NAME --name $AKS_CLUSTER_NAME --query "addonProfiles.azureKeyvaultSecretsProvider.enabled" -o tsv | grep -q "true"; then
    echo "Addon already enabled."
else
    az aks enable-addons --addons azure-keyvault-secrets-provider --name $AKS_CLUSTER_NAME --resource-group $RG_NAME
fi

# 4. Create User Assigned Identity
echo "Creating User Assigned Identity: $IDENTITY_NAME..."
az identity create --resource-group $RG_NAME --name $IDENTITY_NAME

# Get Identity Details
IDENTITY_CLIENT_ID=$(az identity show --resource-group $RG_NAME --name $IDENTITY_NAME --query clientId -o tsv)
IDENTITY_RESOURCE_ID=$(az identity show --resource-group $RG_NAME --name $IDENTITY_NAME --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# 5. Grant Access to Key Vault (RBAC)
echo "Granting Identity access to Key Vault..."
IDENTITY_PRINCIPAL_ID=$(az identity show --resource-group $RG_NAME --name $IDENTITY_NAME --query principalId -o tsv)
az role assignment create --role "Key Vault Secrets User" --assignee $IDENTITY_PRINCIPAL_ID --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_NAME/providers/Microsoft.KeyVault/vaults/$KV_NAME"

# 6. Assign Identity to AKS VM Scale Set (Simpler for this setup than Workload Identity)
# Note: For production with strict isolation, Workload Identity is better, but node-level identity is easier to setup for now.
# Attempting to assign to the kubelet identity for simplicity in usage with the driver
echo "Configuring AKS to use the Identity..."
NODE_RESOURCE_GROUP=$(az aks show --resource-group $RG_NAME --name $AKS_CLUSTER_NAME --query nodeResourceGroup -o tsv)
# We need to assign the created identity to the VMSS so the driver can fallback/use it
# Actually, the easier way for the CSI driver is to use the specific clientID in the SecretProviderClass
# AND ensure that identity is assigned to the VMSS implementation.
# Let's perform the assignment of the user-assigned identity to the VMSS of the cluster.

VMSS_NAME=$(az vmss list --resource-group $NODE_RESOURCE_GROUP --query "[0].name" -o tsv)
az vmss identity assign -g $NODE_RESOURCE_GROUP -n $VMSS_NAME --identities $IDENTITY_RESOURCE_ID

echo "--------------------------------------------------"
echo "Setup Complete!"
echo "Key Vault Name: $KV_NAME"
echo "Tenant ID: $TENANT_ID"
echo "Identity Client ID: $IDENTITY_CLIENT_ID"
echo "--------------------------------------------------"
# Save these for the next step (generating the manifest)
echo "KV_NAME=$KV_NAME" > .kv_env
echo "TENANT_ID=$TENANT_ID" >> .kv_env
echo "IDENTITY_CLIENT_ID=$IDENTITY_CLIENT_ID" >> .kv_env
