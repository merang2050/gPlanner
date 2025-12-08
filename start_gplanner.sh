#!/bin/bash

# Load your shell environment so npm/node are on PATH
# (this matters when launched from Finder / Automator)
if [ -f "$HOME/.bash_profile" ]; then
  source "$HOME/.bash_profile"
fi
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi
if [ -f "$HOME/.zprofile" ]; then
  source "$HOME/.zprofile"
fi
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi

# === Configuration: project folder ===
PROJECT_DIR="/Users/mghafari/tian_lab/planner"

# =============== Do not edit below this line ===============
cd "$PROJECT_DIR" || {
  echo "cd failed to $PROJECT_DIR" >> /tmp/gplanner.log 2>&1
  exit 1
}

# If node_modules doesn’t exist, install dependencies once
if [ ! -d "node_modules" ]; then
  echo "node_modules missing – running npm install (first run)…" >> /tmp/gplanner.log 2>&1
  npm install >> /tmp/gplanner.log 2>&1
fi

# Start Next dev server in the background (logs go to /tmp/gplanner.log)
echo "Starting npm run dev at $(date)" >> /tmp/gplanner.log 2>&1
nohup npm run dev >> /tmp/gplanner.log 2>&1 &

# Small delay so the server has time to start
sleep 5

# Open the app in the default browser
open "http://localhost:3000"

exit 0

