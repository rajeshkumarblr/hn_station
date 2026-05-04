# Deploying HN Station

HN Station supports two deployment targets: **Cloud Mode** (AKS) and **Desktop Mode** (Windows Electron).

---

## 🖥️ Desktop Mode (Windows)

The desktop app is built as a self-contained installer that includes both the React frontend and the Go local backend.

### 1. Build & Package
We use a unified release script to handle the compilation and packaging:

```powershell
# Run the release script from the project root
.\scripts\release.ps1
```

**This script performs the following:**
1.  Compiles the Go local backend (`hn-local.exe`) and moves it to the Electron resources directory.
2.  Builds the React frontend assets (`web/dist`).
3.  Runs `electron-builder` to generate the Windows installer.
4.  Optionally deploys the cloud components if ACR/AKS is configured.

### 2. Output
The final installer will be available at:
`web/release/HN Station Setup {VERSION}.exe`

---

## 🚀 Cloud Mode (Azure AKS)

The web version is deployed to AKS using a unified container model.

### 1. Prerequisites
- **Azure CLI** (`az login`).
- **Docker** installed and running.
- **Access to ACR** (`myhnregistry270`).

### 2. Infrastructure Setup
If you are setting up the environment from scratch:
```bash
# Provision RG, ACR, and AKS
./infrastructure/provision.sh
```

### 3. Deploy (CI/CD)
The deployment is automated via PowerShell to ensure compatibility with Windows-based environments:

```powershell
# Build Docker images, push to ACR, and rollout to AKS
powershell -File infrastructure/deploy_aks.ps1
```

### 4. Database Initialization
The application uses migrations but requires the base `hn_station` database to exist.
```bash
# Apply migrations to the cloud Postgres instance
cat migrations/*.sql | kubectl exec -i postgres-0 -- psql -U hn_user -d hn_station
```

---

## 🏗️ Architecture Summary

- **Desktop**: Electron + Local Go Backend + SQLite.
- **Cloud**: React (embedded in Go) + PostgreSQL (AKS).
- **Communication**: Both versions share the same `internal/` logic for story fetching and AI integration.
