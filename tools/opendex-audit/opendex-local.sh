#!/bin/bash
# Starts OpenDex with its Anthropic provider pointed at a local Ollama server,
# so chat runs free and offline. Only this OpenDex process sees the setting;
# nothing is changed system-wide. Launched normally, OpenDex goes back to the
# real Anthropic endpoint, where the dummy key simply fails (no cost).
#
# Usage: bash opendex-local.sh

set -eu

APP="/Applications/OpenDex.app/Contents/MacOS/OpenDex"
OLLAMA="http://localhost:11434"

if ! curl -s --max-time 2 "$OLLAMA/api/version" >/dev/null; then
  echo "Ollama is not running — open the Ollama app first." >&2
  exit 1
fi
if pgrep -x OpenDex >/dev/null; then
  echo "OpenDex is already running — quit it from the tray icon (Quit) first." >&2
  exit 1
fi

# The AI SDK appends /messages, so the base URL needs the /v1 suffix.
ANTHROPIC_BASE_URL="$OLLAMA/v1" nohup "$APP" >/dev/null 2>&1 &
echo "OpenDex started with the local Ollama model."
