#!/usr/bin/env bash
# deploy_local.sh — Deploy hn_station to the local kind cluster
# Uses your laptop's local Postgres (localhost:5432) — no in-cluster DB needed.
# Access the app at http://localhost:8085 (via port-forward) after running this.
set -euo pipefail

CLUSTER_NAME="kind"
CONTEXT="kind-kind"
K8S_DIR="$(cd "$(dirname "$0")/k8s-local" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Switching kubectl context to $CONTEXT"
kubectl config use-context "$CONTEXT"

# ── 1. Detect host gateway IP (IPv4 only — how pods reach localhost:5432) ──
HOST_GW=$(docker network inspect "$CLUSTER_NAME" \
  --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' \
  | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
if [ -z "$HOST_GW" ]; then
  echo "  Could not auto-detect docker 'kind' network IPv4 gateway. Using 172.18.0.1 ..."
  HOST_GW="172.18.0.1"
fi
echo "  Host gateway (pods → localhost:5432): $HOST_GW"

# ── 2. Install nginx ingress controller (idempotent) ──
echo "▶ Ensuring nginx ingress controller ..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml 2>/dev/null || true

# Delete the admission webhook — its Fail policy blocks kubectl apply in local clusters
kubectl delete validatingwebhookconfiguration ingress-nginx-admission 2>/dev/null || true

echo "  Waiting for ingress-nginx to be ready (up to 120s) ..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s || echo "  (not ready yet, continuing)"

# ── 3. Build Docker images ──
echo "▶ Building backend image ..."
docker build -t hn-station/backend:local -f "$PROJECT_ROOT/Dockerfile.backend" "$PROJECT_ROOT"

echo "▶ Building frontend image ..."
docker build -t hn-station/frontend:local -f "$PROJECT_ROOT/web/Dockerfile" "$PROJECT_ROOT/web"

# ── 4. Load images into kind (no registry needed) ──
echo "▶ Loading images into kind ..."
kind load docker-image hn-station/backend:local  --name "$CLUSTER_NAME"
kind load docker-image hn-station/frontend:local --name "$CLUSTER_NAME"

# ── 5. Apply manifests one-by-one (batch kubectl apply can hang on webhook timeout) ──
echo "▶ Applying k8s manifests ..."
sed "s/HOST_GATEWAY_IP/$HOST_GW/" "$K8S_DIR/host-postgres.yaml" | kubectl apply -f -

# Only create the secret if it doesn't already exist.
# The secrets.yaml in git has placeholder values (safe to commit).
# On first run: fill in real values then let this create it.
# On subsequent runs: the existing live secret is preserved.
if kubectl get secret secrets &>/dev/null; then
  echo "  ℹ️  Secret 'secrets' already exists — skipping (preserving live credentials)."
else
  echo "  Creating secret from $K8S_DIR/secrets.yaml ..."
  echo "  ⚠️  Make sure you've filled in the REPLACE_WITH_... placeholders first!"
  kubectl apply -f "$K8S_DIR/secrets.yaml"
fi

kubectl apply -f "$K8S_DIR/backend.yaml"
kubectl apply -f "$K8S_DIR/ingest.yaml"
kubectl apply -f "$K8S_DIR/frontend.yaml"
kubectl apply -f "$K8S_DIR/ingress.yaml"

# ── 6. Restart deployments to pick up new images ──
echo "▶ Restarting deployments ..."
kubectl rollout restart deployment/backend deployment/ingest deployment/frontend

echo "▶ Waiting for rollouts ..."
kubectl rollout status deployment/backend  --timeout=120s
kubectl rollout status deployment/frontend --timeout=120s

echo ""
echo "✅  Deployment complete!"
echo ""
echo "  NOTE: The existing kind cluster doesn't have port 80 bound to localhost."
echo "  Run this in a separate terminal to access the app:"
echo ""
echo "    kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8085:80"
echo ""
echo "  Then open: http://localhost:8085"
echo ""
echo "Useful commands:"
echo "  kubectl get pods"
echo "  kubectl logs -l app=backend -f"
echo "  kubectl logs -l app=ingest  -f"
