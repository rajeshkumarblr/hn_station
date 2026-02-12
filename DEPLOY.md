# Deploying "my_hn" to Azure Kubernetes Service (AKS)

This guide walks you through deploying the application to AKS using the Free Tier and self-hosted PostgreSQL, keeping costs within $150/month.

## Prerequisites

- **Azure CLI** (`az`) installed and logged in (`az login`).
- **kubectl** installed.
- **Docker** installed.

## 1. Infrastructure Provisioning

Run the provision script to create the Resource Group, ACR, and AKS cluster.

```bash
chmod +x infrastructure/provision.sh
./infrastructure/provision.sh
```

**Note**: This script uses `Standard_B2s` nodes (2x) and the Free Tier AKS management to minimize costs.

## 2. Deploy (Build, Push, & Apply)

Use the automated script to build Docker images, push them to ACR, and deploy to AKS.

```bash
chmod +x infrastructure/deploy_aks.sh
./infrastructure/deploy_aks.sh
```

This script will:
1.  Log in to ACR.
2.  Build and push `backend` and `frontend` images.
3.  Apply all Kubernetes manifests (Secrets, Postgres, Backend, Ingestion, Frontend).

## 3. Verify Deployment

Check the status of your pods:

```bash
kubectl get pods
```

kubectl apply -f infrastructure/k8s/ingest.yaml
kubectl apply -f infrastructure/k8s/frontend.yaml

## 6. Initialize Database (Run Migrations)

The application does not run migrations automatically. You must run them once after deploying Postgres.

```bash
# Apply all UP migrations
cat migrations/*.up.sql | kubectl exec -i postgres-0 -- psql -U hn_user -d my_hn
```

## 7. Access the Application

Get the public IP of the frontend LoadBalancer:

```bash
kubectl get svc frontend --watch
```

Once the `EXTERNAL-IP` is populated, open it in your browser.

## Cost Breakdown (Estimated)

- **AKS Cluster**: $0 (Free Tier)
- **VMs (2x Standard_B2s)**: ~$60/month
- **Managed Disk (10GB)**: < $5/month
- **Load Balancer**: ~$18/month
- **ACR (Basic)**: ~$5/month
- **Total**: ~$88/month
