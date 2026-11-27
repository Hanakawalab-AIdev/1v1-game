#!/bin/sh
# Start the Stomp Duel game server (online / Wi-Fi play) and open the game. macOS / Linux.
# macOS: run `chmod +x start-online-server.sh` once, then double-click or run ./start-online-server.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi
exec node server.js --open
