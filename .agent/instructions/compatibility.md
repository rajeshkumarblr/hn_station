# Dual-Mode Compatibility (Web & Desktop)

> [!IMPORTANT]
> The HN Station repository contains a unified codebase for both the **Web Version** (Postgres/Docker/K8s) and the **Desktop Version** (SQLite/Electron/Windows Service).

### Core Principles
1. **Never Break One for the Other**: Any change to shared components (frontend hooks, layouts, internal logic) must be verified on both platforms.
2. **Auth Handling**: 
   - **Web**: Strictly depends on Google OAuth and JWT sessions.
   - **Desktop**: Supports a "Local Guest" mode for SQlite-only usage AND a "Cloud Sync" mode via Google OAuth. 
   - Backend `handleGetMe` returns an `authenticated` boolean to distinguish these states.
3. **Storage Abstraction**: Use the `storage.DB` interface to interact with data. Logic should not assume Postgres or SQLite specifically unless it's in the driver implementation.
4. **Environment Awareness**: Use `isElectron()` and `isWebPreview()` helpers in the frontend to conditionally render platform-specific UI or logic.

### Desktop-Specific Requirements
- The desktop app must allow users to bookmark and hide stories locally even if they are not signed in to the cloud.
- The "Sign in" button must be visible if the user is not authenticated with a cloud account (`!user && !user.authenticated`).
- When a user signs in to the cloud, local bookmarks/hides should remain accessible.
