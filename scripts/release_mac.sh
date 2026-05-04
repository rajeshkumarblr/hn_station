#!/bin/bash
# scripts/release_mac.sh — Build macOS .dmg installer for HN Station
# Usage: ./scripts/release_mac.sh
#
# Code-signing is intentionally DISABLED (no Apple Developer ID required).
# The resulting .dmg is unsigned — users must right-click → Open on first launch.
#
# Prerequisites:
#   - Go (1.21+)
#   - Node.js + npm
#   - Xcode Command Line Tools  (codesign/notarytool for signing, optional)
#
# Output: ~/Desktop/HN Station-<version>-arm64.dmg  (Apple Silicon)
#         ~/Desktop/HN Station-<version>.dmg          (Intel)

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}ℹ️  $*${NC}"; }
success() { echo -e "${GREEN}✅ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
fatal()   { echo -e "${RED}❌ $*${NC}"; exit 1; }

# ── Resolve project root (one level above scripts/) ───────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
cd "$ROOT"

# ── Read version from package.json ────────────────────────────────────────────
VERSION=$(node -p "require('./web/package.json').version" 2>/dev/null || echo "unknown")
info "Building HN Station v${VERSION} for macOS (.dmg)"

# ── Detect host architecture ───────────────────────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    GOARCH="arm64"
    ELECTRON_ARCH="arm64"
    info "Host: Apple Silicon (arm64)"
else
    GOARCH="amd64"
    ELECTRON_ARCH="x64"
    info "Host: Intel Mac (x64)"
fi

# ── Step 1: Build Go backend for macOS ────────────────────────────────────────
echo ""
info "Step 1/4 — Building Go backend (GOOS=darwin GOARCH=${GOARCH})..."
mkdir -p web/resources
GOOS=darwin GOARCH="$GOARCH" go build -ldflags="-s -w" -o web/resources/hn-local ./cmd/local
success "Backend binary → web/resources/hn-local"

# ── Step 2: Patch package.json extraResources for macOS binary ────────────────
# The default config ships hn-local.exe (Windows). We temporarily swap it for
# the mac binary during electron-builder, then restore the original.
echo ""
info "Step 2/4 — Patching package.json extraResources for macOS binary..."

PKG="web/package.json"
PKG_BACKUP="web/package.json.bak"
cp "$PKG" "$PKG_BACKUP"

# Use node to do a safe in-place JSON patch
DESKTOP="$HOME/Desktop"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
pkg.build.extraResources = [
  {
    from: 'resources/hn-local',
    to: 'hn-local',
    filter: ['**/*']
  }
];
pkg.build.directories = { output: '$DESKTOP' };
// Explicitly disable code signing in the mac config
pkg.build.mac = pkg.build.mac || {};
pkg.build.mac.identity = null;
pkg.build.mac.type = 'distribution';
fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
console.log('Patched: extraResources + output dir → $DESKTOP + identity=null');
"

# Restore original package.json on exit (success or failure)
restore_pkg() {
    if [ -f "$PKG_BACKUP" ]; then
        mv "$PKG_BACKUP" "$PKG"
        info "Restored original package.json"
    fi
}
trap restore_pkg EXIT

# ── Step 3: Build Vite + Electron ─────────────────────────────────────────────
echo ""
info "Step 3/4 — Building frontend + packaging Electron app..."
cd web

if [ ! -d "node_modules" ]; then
    warn "node_modules not found — running npm install..."
    npm install
fi

# Strip any macOS resource-fork/xattr metadata from a previously downloaded
# Electron binary — these cause codesign to fail even in ad-hoc mode.
ELECTRON_CACHE="$HOME/Library/Caches/electron"
if [ -d "$ELECTRON_CACHE" ]; then
    info "Stripping xattr metadata from cached Electron binaries..."
    xattr -cr "$ELECTRON_CACHE" 2>/dev/null || true
fi

# Disable signing via env vars (belt) AND --config flag (suspenders).
# electron-builder v26 ignores CSC_IDENTITY_AUTO_DISCOVERY; identity=null
# in the JSON config (set above) + the --config CLI flag is the reliable fix.
export CSC_IDENTITY_AUTO_DISCOVERY=false
unset CSC_LINK

VITE_ELECTRON=true npm run build:mac -- --"$ELECTRON_ARCH" \
    --config.mac.identity=null

cd "$ROOT"
success "Electron build complete"

# ── Step 4: Locate and report output ──────────────────────────────────────────
echo ""
info "Step 4/4 — Locating output artifacts..."
DMG_FILES=$(find "$HOME/Desktop" -maxdepth 1 -name "*.dmg" 2>/dev/null || true)

if [ -z "$DMG_FILES" ]; then
    fatal "No .dmg file found on Desktop. Check the build output above."
fi

echo ""
success "======================================================"
success " macOS .dmg build complete!"
success "======================================================"
echo ""
echo "  Version : ${VERSION}"
echo "  Arch    : ${ELECTRON_ARCH}"
echo ""
echo "  Output file(s):"
while IFS= read -r dmg; do
    SIZE=$(du -sh "$dmg" | cut -f1)
    echo -e "  ${GREEN}→${NC} $dmg  (${SIZE})"
done <<< "$DMG_FILES"
echo ""
warn "Note: The .dmg is NOT code-signed. macOS Gatekeeper will block it unless"
warn "you either: (a) sign + notarise with an Apple Developer ID, or"
warn "(b) right-click → Open the first time on the target machine."
echo ""
