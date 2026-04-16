# Hacker News Station

[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![Live](https://img.shields.io/badge/Live-hnstation.dev-orange?style=flat-square)](https://hnstation.dev)

A modern, fast, and feature-rich Hacker News client built with Go and React. Optimized for the desktop experience with local-first persistence.

### ⚡ The Experience
> [!TIP]
> **Desktop vs. Web**: The Web version is a "Lite" preview. For the **unrestricted split-pane experience** that loads almost any article side-by-side with comments and offers persistent local storage, use the **Desktop App**.

![Workflow Demo](screenshots/workflow_demo.gif)
*A seamless split-view for reading and discussing simultaneously.*

---

## 🖥️ Electron Desktop App (v0.9.7)

The desktop app is designed for speed and reliability, featuring a **Local-First Architecture** where your data is stored directly on your machine.

### ✨ Key Features
- **Dedicated Primary Tabs**: Split view between **FEED** (Top/New stories) and **BOOKMARKS** (Your saved stories).
- **Advanced Content Extraction**: 
    - **PDF Support**: AI summaries can now "read" PDF documents (up to 20 pages).
    - **GitHub README Integration**: Show HN projects automatically fetch repository documentation for context-aware summaries.
- **Zero-Login Reader**: Local SQLite persistence for your bookmarks, read history, and topic filters—no account required.
- **Simplified Story Cards**: Consolidated reader access with a single "Split View" default.
- **Rich Sidebar Summaries**: AI-powered takeaways from Ollama (local) or Gemini Pro (cloud).

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
| :--- | :--- |
| `Ctrl + W` | Close current reader tab (Reader view) |
| `Ctrl + W` | **Exit Application** (Feed view) |
| `Ctrl + D` | Toggle Bookmark for active story |
| `Ctrl + 0` | Switch to Feed view |
| `Ctrl + Space` | Cycle reader view: Article → Discussion → Split |
| `j` / `k` | Navigate stories in the feed |
| `Enter` | Open story in Reader |

### 🛠️ Desktop Architecture
- **In-App Backend**: A Go-based local agent runs alongside the app, handling continuous background ingestion and data persistence.
- **SQLite Storage**: All data persists at `%APPDATA%/HN Station/` on Windows.
- **Port Mapping**: Uses port `58090` for robust local communication.

---

## 🚀 Web Setup (AKS)

The web version is deployed to Azure Kubernetes Service (AKS) as a unified container, serving as a high-speed preview of the HN Station experience.

- **Frontend**: React SPA served directly by the Go backend.
- **Data Layer**: Postgres managed via StatefulSet.
- **Live Site**: [hnstation.dev](https://hnstation.dev)

---

## 🏗️ Development

### 🏁 Prerequisites
- **Go 1.22+**
- **Node.js 20+**
- **Ollama** (Optional, for local AI features)

### 💻 Build & Release
We use a unified release script for consistent builds across platforms:
```powershell
# Build backend and desktop installers
.\scripts\release.ps1
```
