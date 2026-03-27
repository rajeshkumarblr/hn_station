# HN Station — Design Document

> **Version**: 1.8.5 · **Last Updated**: 2026-03-27
> Live at [hnstation.dev](https://hnstation.dev)

This document captures the **architectural decisions, design rationale, and operational constraints** that govern HN Station. It exists so future changes don't accidentally revert hard-won lessons.

---

## 1. System Overview

HN Station runs as **two independent deployments** that share the same Postgres database via a dual-sync pattern:

```
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│     DESKTOP APP (Electron)       │     │     CLOUD WEB APP (AKS)          │
│                                  │     │                                  │
│  ┌────────────┐  ┌────────────┐  │     │  ┌────────────┐  ┌────────────┐ │
│  │ React UI   │  │ hn-local   │  │     │  │ React UI   │  │ Go API     │ │
│  │ (Vite)     │  │ (Go)       │  │     │  │ (Nginx)    │  │ (cmd/server│ │
│  └─────┬──────┘  └──┬───┬────┘  │     │  └─────┬──────┘  └──┬────────┘ │
│        │            │   │       │     │        │            │          │
│        └────────────┘   │       │     │        └────────────┘          │
│              │          │       │     │              │                 │
│         ┌────▼────┐     │       │     │         ┌────▼────┐            │
│         │ SQLite  │     │       │     │         │Postgres │            │
│         │ (local) │     │       │     │         │ (cloud) │            │
│         └─────────┘     │       │     │         └─────────┘            │
│                         │       │     │              ▲                 │
│              ┌──────────┘       │     │              │                 │
│              │ Dual-Sync        │     │         ┌────┴────┐            │
│              │ (MultiStore)     │────────────▶  │Postgres │            │
│              └──────────────────│     │         │ (same)  │            │
│                                  │     │         └─────────┘            │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

---

## 2. Key Architectural Decisions

### 2.1 Dual-Mode Storage (`storage.DB` Interface)

**Decision**: A single `storage.DB` interface is implemented by both `SQLiteStore` (local) and `PostgresStore` (cloud). They have **different schemas** but the same Go interface.

**Rationale**: The desktop app needs offline-first operation (SQLite), while the cloud needs multi-user features (Postgres with auth_users, user_interactions, chat_messages).

**Key Differences**:

| Aspect | SQLite (`sqlite.go`) | Postgres (`store.go`) |
|--------|---------------------|-----------------------|
| Topics | JSON text column `'[]'` | `text[]` array |
| Users table | `hn_users` | `users` (has `submitted`) |
| Auth | Stubs (returns errors) | Full Google OAuth |
| Interactions | Inline `is_read/is_saved/is_hidden` on `stories` | Separate `user_interactions` table |
| Embedding | Not supported | `pgvector` (768-dim, currently disabled) |
| Full-text search | Not supported | `search_vector` tsvector column |
| Chat | Stubs | `chat_messages` table |

> **⚠️ CRITICAL**: Each store generates its own SQL. The `MultiStore` calls the correct store's method, so **type conversions are handled automatically**. Never try to send SQLite-formatted data (JSON topics) directly to a Postgres query.

### 2.2 MultiStore Dual-Sync (`internal/storage/multi.go`)

**Decision**: The desktop ingestion service writes to **both** SQLite (primary) and Cloud Postgres (secondary) using a `MultiStore` wrapper.

**Rationale**: The cloud web app has `DISABLE_AI=true` on its ingest pod (to save costs / no GPU), so AI summaries are generated **only on the desktop** using local Ollama, and synced to the cloud.

**Rules**:
1. **Primary always succeeds first**. If the primary write fails, the error is returned immediately and secondaries are not attempted.
2. **Secondary failures are logged but never block**. The desktop app must never hang because the cloud is unreachable.
3. **Read operations always go to primary only**. The MultiStore never reads from secondaries.
4. **Auth-related operations route to the first secondary** (if available), since auth only exists in Postgres.

### 2.3 Synchronous Secondary Connection (15s Timeout)

**Decision**: The secondary database connection is established **synchronously** at startup with a 15-second timeout.

**Rationale (learned the hard way)**:
- ❌ **Async connection**: Caused a timing race. Ingestion started immediately but the secondary wasn't connected yet. Stories were upserted only to SQLite. Later, `UpdateStorySummaryAndTopics` is an UPDATE (not INSERT), so it silently matched zero rows in the cloud Postgres.
- ✅ **Synchronous with timeout**: Waits up to 15s for the cloud. If it connects, all subsequent writes go to both. If it times out, the app continues with SQLite only — no hang, no crash.

### 2.4 Environment Variable Loading in Windows Service

**Decision**: `cmd/local/main.go` explicitly loads `.env` files from three locations using `godotenv`:

```go
_ = godotenv.Load()                                           // 1. CWD
_ = godotenv.Load(filepath.Join(filepath.Dir(exe), ".env"))   // 2. Executable dir
_ = godotenv.Load(filepath.Join(filepath.Dir(dbPath), ".env"))// 3. DB dir (ProgramData)
```

**Rationale**: Windows services run in an isolated session (usually `C:\Windows\System32` as CWD) with no user environment. The `.env` at `C:\ProgramData\HNStation\.env` is the canonical source of truth for service mode.

> **⚠️ CRITICAL**: The `.env` file at `C:\ProgramData\HNStation\.env` must contain `SECONDARY_DATABASE_URL` pointing to the **Cloud Postgres external LoadBalancer IP**, not localhost.

### 2.5 Cloud Ingestion Has AI Disabled

**Decision**: The cloud ingest deployment (`infrastructure/k8s/ingest.yaml`) runs with `DISABLE_AI=true`.

**Rationale**: 
- No GPU available on the AKS cluster nodes (`Standard_B2s`).
- AI summaries are generated locally on the user's desktop (which has Ollama + llama3) and synced via the MultiStore.
- This keeps cloud costs minimal (~₹3,500/mo).

> **⚠️ CRITICAL**: Never remove `DISABLE_AI=true` from the cloud ingest deployment. Doing so would attempt to call Ollama at `http://ollama:11434` which doesn't exist in the cluster.

---

## 3. Components

### 3.1 Desktop App (`cmd/local`)

A **single Go binary** (`hn-local.exe`) that runs both the API server and the ingestion worker in one process. Bundled inside the Electron app as an extra resource.

**Startup sequence**:
1. Check if running as a Windows Service → `svc.Run()`
2. Otherwise, parse CLI flags and run in interactive mode
3. Open/create SQLite database
4. Load `.env` from multiple fallback locations
5. **Synchronously** attempt secondary (cloud) database connection (15s timeout)
6. Start API server on port 58090
7. Start ingestion worker (5-minute interval)
8. Start 3 summary workers with Ollama (500ms rate-limited)

**Windows Service** (`HNStationIngest`):
- Installed via `hn-local.exe --install` (requires admin)
- Runs as `SYSTEM`, starts automatically
- Database: `C:\ProgramData\HNStation\hn.db`
- Logs: `C:\ProgramData\HNStation\service.log`
- Config: `C:\ProgramData\HNStation\.env`

### 3.2 Cloud Backend (`cmd/server`)

A Go binary using `go-chi/chi` serving the REST API. Connects to Cloud Postgres directly. Features Google OAuth, user interactions, AI chat (Gemini BYOK), admin dashboard.

**Key routes**: `/api/stories`, `/api/stories/{id}`, `/api/chat`, `/auth/google`, `/api/me`

### 3.3 Cloud Ingestion (`cmd/ingest`)

A Go binary that polls the HN Firebase API every minute. Upserts stories, comments, and users to Cloud Postgres. AI is **disabled** — summaries come from the desktop dual-sync.

### 3.4 Frontend (`web/`)

React 18 + TypeScript + Vite + Tailwind CSS. Builds to **two targets**:
1. **Web**: Static files served by Nginx container in AKS
2. **Desktop**: Electron app wrapping the same React code with `vite-plugin-electron`

**Layout**: Three-pane resizable design:
- Left: Story list (filterable, sortable, paginated)
- Center: Reader pane (Electron webview for articles, threaded comments)
- Right: AI sidebar (summary, chat)

### 3.5 AI Summary Pipeline

```
Story (score > 10, has URL)
    │
    ▼
summaryQueue (buffered channel, 100)
    │
    ▼
Summary Worker (3 workers, 500ms rate-limited)
    │
    ├── content.FetchArticle() → go-readability extraction
    ├── Truncate to 8000 chars
    ├── Try Ollama (local llama3) → JSON response with summary + topics
    ├── Fallback: Try Gemini (if API key available)
    └── store.UpdateStorySummaryAndTopics() → writes to SQLite + Cloud PG via MultiStore
```

**AI Provider Priority** (configurable via settings):
1. `local` — Ollama only
2. `gemini` — Gemini only
3. `both` — Try Ollama first, fallback to Gemini

---

## 4. Infrastructure

### 4.1 Azure AKS Cluster

| Resource | Spec |
|----------|------|
| Cluster | `my-hn-cluster`, East US |
| Node Pool | 1× `Standard_B2s` (2 vCPU, 4 GB RAM) |
| Container Registry | `myhnregistry270.azurecr.io` |
| Key Vault | Stores `database_url`, `google_client_id`, `google_client_secret`, `jwt_secret`, `password` |
| DNS | `hnstation.dev` → NGINX Ingress Controller |
| TLS | Let's Encrypt via cert-manager (`letsencrypt-prod`) |

### 4.2 Kubernetes Workloads

| Workload | Type | Replicas | Image |
|----------|------|----------|-------|
| `backend` | Deployment | 2 | `backend:latest` |
| `frontend` | Deployment | 1 | `frontend:latest` |
| `ingest` | Deployment | 1 | `backend:latest` (runs `/app/ingest`) |
| `postgres` | StatefulSet | 1 | `pgvector/pgvector:pg16` |

### 4.3 Kubernetes Services

| Service | Type | Purpose |
|---------|------|---------|
| `backend` | ClusterIP | Internal API access |
| `frontend` | ClusterIP | Internal frontend access |
| `postgres` | Headless (`clusterIP: None`) | Internal DB access for backend/ingest |
| `postgres-external` | **LoadBalancer** | External DB access for desktop dual-sync |

> **⚠️ CRITICAL**: The `postgres-external` service's external IP (`20.75.144.138` as of 2026-03-27) is what the desktop app uses to sync to the cloud. If this IP changes (e.g., service recreation), update `C:\ProgramData\HNStation\.env` on all desktop machines.

### 4.4 Networking

```
Internet → hnstation.dev → NGINX Ingress Controller
                              ├── /api/* → backend:8080
                              ├── /auth/* → backend:8080
                              └── /* → frontend:80

Desktop App → 127.0.0.1:58090 → hn-local.exe (SQLite + Cloud PG sync)
```

---

## 5. Database Schemas

### 5.1 Cloud Postgres (`my_hn` database)

| Table | Purpose |
|-------|---------|
| `stories` | HN stories with summary, topics, embedding, search_vector |
| `comments` | Threaded comments with parent_id |
| `users` | HN user profiles (karma, about, submitted) |
| `auth_users` | Google OAuth users (google_id, email, is_admin, gemini_api_key) |
| `user_interactions` | Per-user story read/saved/hidden state |
| `chat_messages` | AI chat history per user-story pair |
| `settings` | Global app settings (ai_provider, ollama_model, etc.) |

### 5.2 Local SQLite (`hn.db`)

| Table | Purpose |
|-------|---------|
| `stories` | Same as Postgres but topics as JSON text, includes inline is_read/is_saved/is_hidden |
| `comments` | Same as Postgres |
| `hn_users` | Same as Postgres `users` but different table name, no `submitted` column |
| `settings` | Same as Postgres |

> **Note**: The SQLite schema does NOT have `auth_users`, `user_interactions`, or `chat_messages`. These are cloud-only features. The `SQLiteStore` returns stub errors for auth methods.

---

## 6. Release & Deployment

### 6.1 Unified Release Script (`scripts/release.ps1`)

```powershell
# 1. Build Go backend → web/resources/hn-local.exe
# 2. Deploy to AKS (via infrastructure/deploy_aks.ps1)
#    - ACR login, Docker build/push, kubectl apply, rollout restart
# 3. Build Electron installer → web/release/HN Station Setup {VERSION}.exe
# 4. Create GitHub release
```

### 6.2 Version Management

The version string appears in three places that **must stay in sync**:
1. `web/package.json` → `"version": "1.8.5"`
2. `scripts/release.ps1` → `$VERSION = "1.8.5"`
3. `web/src/layouts/DesktopLayout.tsx` → `Web UI v1.8.5` (hardcoded display string)

### 6.3 Patching the Windows Service

After building a new `hn-local.exe`, reinstall via the Electron installer. The installer's NSIS script handles stopping/starting the service and copying the binary.

---

## 7. Critical Operational Notes

### ❌ Things That Have Failed Before

1. **Triple-sync to local Postgres**: Adding a local Postgres as a third sync target caused startup hangs when the local PG wasn't running. The app should only sync to SQLite (primary) and Cloud PG (secondary).

2. **Async secondary connection**: Caused a timing race where stories were upserted before the cloud connection was established, leading to missing summaries on the web.

3. **Wrong LoadBalancer IP in .env**: The `postgres-external` service IP (`20.75.144.138`) was confused with another service IP. Always verify with `kubectl get svc postgres-external`.

4. **WSL/Bash for deployment on Windows**: The `deploy_aks.sh` script failed because WSL's network stack couldn't reach Docker/ACR. Use `deploy_aks.ps1` (native PowerShell) instead.

5. **Windows Service can't read user env vars**: Services run as SYSTEM with no user env. Must load `.env` from `C:\ProgramData\HNStation\.env` explicitly.

### ✅ Invariants That Must Be Preserved

1. Cloud ingest must have `DISABLE_AI=true` — summaries come from the desktop only.
2. Desktop `hn-local.exe` must use `MultiStore` with synchronous secondary connection (15s timeout).
3. The `.env` at `C:\ProgramData\HNStation\.env` must point `SECONDARY_DATABASE_URL` to the cloud `postgres-external` LoadBalancer IP.
4. Desktop ingestion interval is 5 minutes; cloud ingestion interval is 1 minute.
5. The Postgres `UpdateStorySummaryAndTopics` is an UPDATE, not an UPSERT — the story row must already exist for the summary to be saved.

---

## 8. Cost Profile

| Resource | Monthly Cost (approx.) |
|----------|----------------------|
| AKS cluster (1× B2s) | ₹2,500 |
| Managed disk (10 GiB SSD) | ₹100 |
| Container Registry (Basic) | ₹600 |
| Load Balancer | ₹300 |
| **Total** | **~₹3,500/mo** |

AI costs are zero (local Ollama). Gemini usage is BYOK (user's own key).
