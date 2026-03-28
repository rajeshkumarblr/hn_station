# Hacker News Station

[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Live](https://img.shields.io/badge/Live-hnstation.dev-orange?style=flat-square)](https://hnstation.dev)

A modern, fast, and feature-rich Hacker News client built with Go and React. Live at **[hnstation.dev](https://hnstation.dev)**, or as a **fully-contained local Desktop app**.

![HN Station Feed](screenshots/feed_view.png)

---

## 🖥️ Electron Desktop App (Local Mode)

A powerful, zero-login desktop experience. It uses a **Background Windows Service** for continuous story ingestion, ensuring your feed is always fresh even when the app is closed.

### ✨ Desktop Features (v1.8.5)
- **Optional Cloud Sync**: Sign in with Google on desktop to sync bookmarks with the cloud Postgres database.
- **Tab Refresh Buttons**: Manual refresh icons for the Feed and individual story tabs.
- **Background Ingestion Service**: Stories are fetched continuously in the background via a native Windows service.
- **Shared Persistent Storage**: Your database stays safe at `C:\ProgramData\HNStation\hn.db` even during app upgrades.
- **Independent Web/Desktop Core**: Build-time optimized versions for maximum performance and security.
- **Robust Port-Mapping**: Uses a safe, non-conflicting port (`58090`) to avoid common system blocks.

### 🏁 Prerequisites
- **Windows 10/11** (Recommended)
- **Ollama** (Optional, for local AI summaries)

### 💻 Windows Native Setup (Internal Release)
The desktop app is now distributed as a single **Unified Installer**:
1. Run `HN Station Setup 1.1.0.exe` (installed per-machine).
2. The installer automatically registers the **HN Station Ingestion Service**.
3. Launch **HN Station** from your Start menu or Desktop.

---

## ✨ System Features

- **Split-Pane Workspace**: Browse the feed and read articles side-by-side.
- **Automated AI Summaries**: Concise article takeaways powered by Local Ollama or Gemini Pro.
- **Tabbed Settings Modal**: Centralized management for AI providers and UI themes.
- **Multi-Tag Search**: Comprehensive topic management with parallel filtering.
- **History-Based Navigation**: Intelligent "Back" logic for a cleaner workflow.
- **Keyboard-First**: Vim-like navigation (`j`/`k`), `Enter` to read.

---

## 🚀 Web Setup (Docker/AKS)

```bash
git clone https://github.com/rajeshkumarblr/hn_station && cd hn_station
cp .env.example .env   # add OAuth & Secret
docker-compose up --build
```
Open **http://localhost:3000** or check **[hnstation.dev](https://hnstation.dev)**.

---

## 🏗️ Architecture
The system follows a decoupled architecture:
1. **Ingestion Service**: A background Go worker for continuous HN data fetching (SQLite).
2. **Local API**: A lightweight Go server serving the Electron frontend.
3. **Web Backend**: A containerized Go API for the live web preview (Postgres).
4. **React Frontend**: Shared UI with platform-agnostic adapters for Web vs. Electron.
