#!/bin/bash
# Installs Car Deal Agent on macOS. Paste into Terminal:
#
#   curl -fsSL https://raw.githubusercontent.com/MoZien/MoZien/claude/intelligent-fermi-lme4t3/car-deal-agent/install-mac.sh | bash
#
# Running it again updates the code and keeps config.yaml, .env and the database.
# Written for the bash 3.2 that ships with macOS.
set -euo pipefail

REPO="MoZien/MoZien"
BRANCH="${CARDEAL_BRANCH:-claude/intelligent-fermi-lme4t3}"
TARGET="${CARDEAL_DIR:-$HOME/car-deal-agent}"
PYTHON_DOWNLOAD="https://www.python.org/downloads/macos/"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mFehler: %s\033[0m\n' "$1" >&2; exit 1; }

# Prompts read from the terminal, because stdin is this script when piped into bash.
ask() {
  local answer=""
  if [ "${3:-}" = "secret" ]; then
    read -r -s -p "$2" answer < /dev/tty || true
    echo
  else
    read -r -p "$2" answer < /dev/tty || true
  fi
  printf -v "$1" '%s' "$answer"
}

[ "$(uname)" = "Darwin" ] || fail "Dieses Skript ist für macOS."

find_python() {
  local candidate path
  for candidate in python3.13 python3.12 python3.11 python3.10 \
      /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
    path="$(command -v "$candidate" 2>/dev/null)" || continue
    # /usr/bin/python3 is a stub that opens the Xcode installer when the tools are missing.
    if [ "$path" = "/usr/bin/python3" ] && ! xcode-select -p >/dev/null 2>&1; then
      continue
    fi
    if "$path" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      echo "$path"
      return 0
    fi
  done
  return 1
}

say "Suche Python 3.10 oder neuer"
if ! PYTHON="$(find_python)"; then
  if command -v brew >/dev/null 2>&1; then
    say "Installiere Python mit Homebrew"
    brew install python@3.12
    PYTHON="$(find_python)" || fail "Python wurde installiert, aber nicht gefunden. Terminal neu öffnen und Skript erneut starten."
  else
    open "$PYTHON_DOWNLOAD" || true
    fail "Kein passendes Python gefunden. Installiere Python 3.12 von $PYTHON_DOWNLOAD (die Seite ist jetzt offen) und starte das Skript danach erneut."
  fi
fi
echo "Gefunden: $PYTHON ($("$PYTHON" --version))"

say "Lade Car Deal Agent herunter"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.zip" -o "$TMP/source.zip" \
  || fail "Download fehlgeschlagen. Internetverbindung prüfen."
unzip -q "$TMP/source.zip" -d "$TMP"
SOURCE="$(find "$TMP" -mindepth 2 -maxdepth 2 -type d -name car-deal-agent | head -n 1)"
[ -n "$SOURCE" ] || fail "Im Download fehlt der Ordner car-deal-agent."
mkdir -p "$TARGET"
# The repo has no config.yaml, .env or data/, so the user's files survive an update.
cp -R "$SOURCE/." "$TARGET/"
echo "Installiert nach $TARGET"

say "Installiere Python-Pakete (dauert ein bis zwei Minuten)"
[ -x "$TARGET/.venv/bin/python" ] || "$PYTHON" -m venv "$TARGET/.venv"
"$TARGET/.venv/bin/python" -m pip install --quiet --upgrade pip
"$TARGET/.venv/bin/python" -m pip install --quiet -e "$TARGET"

cd "$TARGET"
if [ ! -f config.yaml ]; then
  cp config.example.yaml config.yaml
  echo "config.yaml angelegt (Suche: alle Autos bis 3.000 €, Privat, 200 km um Halle)."
else
  echo "config.yaml bleibt unverändert."
fi

if [ -f .env ]; then
  say "Zugangsdaten"
  echo ".env existiert schon und bleibt unverändert."
else
  say "Zugangsdaten (Enter drücken, um etwas zu überspringen)"
  echo "Claude API-Key: https://platform.claude.com → API Keys (vorher unter Billing Guthaben aufladen)."
  ask API_KEY "ANTHROPIC_API_KEY (Eingabe bleibt unsichtbar): " secret
  echo
  echo "Telegram-Bot: in Telegram @BotFather öffnen, /newbot senden, Namen wählen, Token kopieren."
  ask BOT_TOKEN "TELEGRAM_BOT_TOKEN (Eingabe bleibt unsichtbar): " secret
  CHAT_ID=""
  if [ -n "$BOT_TOKEN" ]; then
    echo "Öffne jetzt deinen neuen Bot in Telegram, tippe auf Start und schick ihm eine Nachricht."
    ask CONTINUE "Danach hier Enter drücken... "
    CHAT_ID="$(curl -fsS "https://api.telegram.org/bot$BOT_TOKEN/getUpdates" 2>/dev/null | "$PYTHON" -c '
import json, sys
try:
    updates = json.load(sys.stdin).get("result", [])
except ValueError:
    updates = []
ids = [u[k]["chat"]["id"] for u in updates for k in ("message", "my_chat_member") if k in u]
print(ids[-1] if ids else "")
' || true)"
    if [ -n "$CHAT_ID" ]; then
      echo "Chat-ID gefunden: $CHAT_ID"
    else
      echo "Keine Nachricht gefunden (Token richtig? Nachricht an den Bot geschickt?)."
      ask CHAT_ID "TELEGRAM_CHAT_ID manuell eingeben oder Enter für später: "
    fi
  fi
  umask 077
  cat > .env <<EOF
ANTHROPIC_API_KEY=$API_KEY
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
TELEGRAM_CHAT_ID=$CHAT_ID
EOF
  umask 022
  echo ".env gespeichert (nur für deinen Benutzer lesbar)."
fi

# Double-clickable starter. caffeinate keeps the Mac awake while the bot runs.
cat > "Car Deal Agent starten.command" <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "Car Deal Agent läuft. Fenster offen lassen; beenden mit Ctrl+C."
caffeinate -i .venv/bin/cardeal run
EOF
chmod +x "Car Deal Agent starten.command"

say "Fertig!"
cat <<EOF
Ordner: $TARGET

Einzelne Anzeige prüfen (testet auch die KI):
  cd "$TARGET" && .venv/bin/cardeal analyze "<Link zur Anzeige>"

Dauerbetrieb starten:
  Doppelklick auf "Car Deal Agent starten.command" im Ordner $TARGET
  (oder: cd "$TARGET" && .venv/bin/cardeal run)

Der erste Lauf sammelt nur Marktdaten. Nachrichten kommen ab der nächsten neuen Anzeige.
Suche ändern: $TARGET/config.yaml   Zugangsdaten ändern: $TARGET/.env
EOF
open "$TARGET" || true
