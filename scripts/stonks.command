#!/bin/bash
# Double-clickable launcher for stonks. Preflight in plain English, then boot + open the browser.
set -u
cd "$(dirname "$0")/.." || { echo "Could not find the stonks folder."; read -r; exit 1; }

fail() { echo ""; echo "⚠️  $1"; echo ""; echo "Press Return to close."; read -r; exit 1; }

# 1. claude on PATH?
command -v claude >/dev/null 2>&1 || fail "Claude Code isn't installed or isn't on your PATH. Install it, then try again."

# 2. notebooklm auth present?
[ -f "$HOME/.notebooklm/storage_state.json" ] || fail "NotebookLM isn't logged in yet. Run the NotebookLM login once, then try again."

# 3. deps installed?
[ -d "node_modules/next" ] || fail "Dependencies aren't installed. Open Terminal in this folder and run: pnpm install"

# 4. database present?
[ -f "data/stonks.db" ] || echo "Note: no data yet — your first Run will create it."

PORT=4317
echo "Starting stonks…  (leave this window open; closing it stops the app)"

# Build once (fast no-op if already built), then start.
pnpm build >/tmp/stonks-build.log 2>&1 || fail "Build failed. See /tmp/stonks-build.log"
pnpm start >/tmp/stonks-run.log 2>&1 &
SERVER_PID=$!

# Wait for the port to answer, then open the browser.
for _ in $(seq 1 30); do
  if curl -s "http://localhost:$PORT" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
open "http://localhost:$PORT"

echo "stonks is running at http://localhost:$PORT"
echo "Close this window (or press Ctrl-C) to stop."
wait $SERVER_PID
