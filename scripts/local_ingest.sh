#!/bin/bash

# Configuration
PROJECT_ROOT="/home/rajesh/proj/hn_station"
BINARY_PATH="$PROJECT_ROOT/bin/ingest"
PORT_FORWARD_PORT=5433
PORT_FORWARD_TARGET="svc/postgres:5432"
LOG_FILE="$PROJECT_ROOT/logs/ingest.log"
LOCK_FILE="/tmp/hn_ingest.lock"

mkdir -p "$PROJECT_ROOT/bin"
mkdir -p "$PROJECT_ROOT/logs"

# Use flock to prevent overlapping runs
(
  flock -n 200 || { echo "[$(date)] Ingestion already running, skipping." >> "$LOG_FILE"; exit 1; }

  echo "[$(date)] Starting local ingestion..." >> "$LOG_FILE"

  # 1. Start port-forward in background
  kubectl port-forward "$PORT_FORWARD_TARGET" "$PORT_FORWARD_PORT:5432" > /dev/null 2>&1 &
  PF_PID=$!

  # Wait for tunnel to be ready (increased for safety)
  sleep 8

  # 2. Run ingestion (using nice and ionice for background resource safety)
  cd "$PROJECT_ROOT"
  nice -n 15 ionice -c 3 "$BINARY_PATH" --one-shot >> "$LOG_FILE" 2>&1

  # 3. Cleanup
  kill $PF_PID
  echo "[$(date)] Ingestion completed." >> "$LOG_FILE"

) 200>"$LOCK_FILE"
