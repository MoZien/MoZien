#!/bin/bash
# OpenDex diagnostics for macOS (Intel + Apple Silicon).
#
# Read-only: changes no settings, permissions, or files of OpenDex. The only
# file it writes is the report in the current directory. Secrets are never
# read from OpenDex's store and never printed; all output passes a redaction
# filter as a second safety net.
#
# Usage:
#   bash opendex-diagnose.sh               # offline/free checks only
#   bash opendex-diagnose.sh --auth-test   # + key/billing/realtime handshake test
#                                          #   (asks for the key, invisible input)

set -u

AUTH_TEST=0
[ "${1:-}" = "--auth-test" ] && AUTH_TEST=1

GATEWAY="https://ai-gateway.vercel.sh"
RT_MODEL_DEFAULT="openai/gpt-realtime-2"
REPORT="$(pwd)/opendex-report-$(date +%Y%m%d-%H%M%S).txt"
TMPDIR_DX="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_DX"; unset DX_KEY' EXIT

redact() {
  sed -E \
    -e 's/(vck_|sk-|sk_|xai-|tvly-)[A-Za-z0-9_-]{6,}/\1***REDACTED***/g' \
    -e 's/(Bearer )[A-Za-z0-9._-]+/\1***REDACTED***/g' \
    -e 's/(ai-gateway-auth\.)[^ ,;]+/\1***REDACTED***/g'
}

section() { printf '\n==================== %s ====================\n' "$1"; }
ok()   { printf '  [OK]   %s\n' "$1"; }
warn() { printf '  [WARN] %s\n' "$1"; }
info() { printf '  [INFO] %s\n' "$1"; }

# WebSocket upgrade against the gateway's realtime endpoint, exactly like
# OpenDex's main process does it. Prints only the HTTP status line and, on
# failure, the gateway's JSON error. $1 = model id, $2 = key or empty.
ws_probe() {
  local model="$1" key="$2" model_q hdr body status
  model_q="$(printf '%s' "$model" | sed 's#/#%2F#g')"
  hdr="$TMPDIR_DX/ws_hdr"; body="$TMPDIR_DX/ws_body"
  if [ -n "$key" ]; then
    # Key goes in via --config on stdin so it never appears in argv / ps.
    printf 'header = "Sec-WebSocket-Protocol: ai-gateway-realtime.v1, ai-gateway-auth.%s"\n' "$key" |
      curl -sS --http1.1 --config - --max-time 6 -D "$hdr" -o "$body" \
        -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        "$GATEWAY/v4/ai/realtime-model?ai-model-id=$model_q" 2>"$TMPDIR_DX/ws_err"
  else
    curl -sS --http1.1 --max-time 10 -D "$hdr" -o "$body" \
      -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
      -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
      -H "Sec-WebSocket-Protocol: ai-gateway-realtime.v1" \
      "$GATEWAY/v4/ai/realtime-model?ai-model-id=$model_q" 2>"$TMPDIR_DX/ws_err"
  fi
  status="$(grep -E '^HTTP/' "$hdr" 2>/dev/null | tail -1 | awk '{print $2}')"
  printf '%s' "${status:-000}" > "$TMPDIR_DX/ws_status"
  if [ -z "$status" ]; then
    warn "no HTTP response: $(head -c 300 "$TMPDIR_DX/ws_err" 2>/dev/null)"
  elif [ "$status" = "101" ]; then
    ok "HTTP 101 Switching Protocols (handshake accepted, closed right away)"
  else
    info "HTTP $status: $(head -c 400 "$body" 2>/dev/null)"
  fi
}

main() {
  echo "OpenDex diagnose report — $(date)"
  echo "Read-only run. Auth test: $([ $AUTH_TEST = 1 ] && echo yes || echo no)"

  # ------------------------------------------------------------------ system
  section "1. System"
  local os_ver os_major arch cpu mem_gb
  os_ver="$(sw_vers -productVersion)"; os_major="${os_ver%%.*}"
  arch="$(uname -m)"
  cpu="$(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
  mem_gb=$(( $(sysctl -n hw.memsize) / 1073741824 ))
  info "macOS $os_ver (build $(sw_vers -buildVersion))"
  info "Architecture: $arch | CPU: $cpu | Cores: $(sysctl -n hw.ncpu) | RAM: ${mem_gb} GB"
  [ "$arch" = "x86_64" ] && ok "Intel x86_64" || info "Non-Intel architecture: $arch"
  [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ] && warn "Shell runs under Rosetta"
  df -h / | awk 'NR==2 {print "  [INFO] Disk /: " $4 " free of " $2 " (" $5 " used)"}'
  [ "$mem_gb" -lt 8 ] && warn "Less than 8 GB RAM — local Whisper/Vosk models will be slow"

  # --------------------------------------------------------------------- app
  section "2. OpenDex installation"
  local app="" p
  for p in "/Applications/OpenDex.app" "$HOME/Applications/OpenDex.app"; do
    [ -d "$p" ] && app="$p" && break
  done
  if [ -z "$app" ]; then
    app="$(mdfind "kMDItemCFBundleIdentifier == 'io.opendex.app'" 2>/dev/null | head -1)"
  fi
  if [ -z "$app" ]; then
    warn "OpenDex.app not found (searched /Applications, ~/Applications, Spotlight)"
  else
    local plist="$app/Contents/Info.plist" ver min_os exe
    ver="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist" 2>/dev/null)"
    min_os="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist" 2>/dev/null)"
    exe="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist" 2>/dev/null)"
    info "Location: $app"
    info "Version: $ver | Bundle ID: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" 2>/dev/null)"
    info "Binary: $(file -b "$exe" | head -1)"
    if file -b "$exe" | grep -q x86_64; then ok "Binary contains x86_64 (Intel-native)"
    else warn "Binary has no x86_64 slice — wrong download (arm64 build on Intel?)"; fi
    if [ -n "$min_os" ]; then
      if [ "$os_major" -ge "${min_os%%.*}" ]; then ok "macOS $os_ver >= required $min_os"
      else warn "macOS $os_ver is older than required $min_os"; fi
    fi
    local latest
    latest="$(curl -s --max-time 10 https://api.github.com/repos/wassgha/opendex/releases/latest |
      sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)"
    if [ -n "$latest" ]; then
      [ "$latest" = "$ver" ] && ok "Up to date (latest release $latest)" ||
        warn "Installed $ver, latest release is $latest"
    else
      info "Could not query latest release (offline or GitHub rate limit)"
    fi

    # ------------------------------------------------------------- signing
    section "3. Code signing, Gatekeeper, origin"
    if codesign --verify --deep --strict "$app" 2>"$TMPDIR_DX/cs"; then ok "codesign --verify --deep --strict passed"
    else warn "codesign verify FAILED: $(head -c 300 "$TMPDIR_DX/cs")"; fi
    codesign -dv --verbose=2 "$app" 2>&1 |
      grep -E '^(Identifier|Authority|TeamIdentifier|Timestamp|Runtime Version)|flags=' | sed 's/^/  [INFO] /'
    spctl --assess --type execute -vv "$app" 2>&1 | sed 's/^/  [INFO] /'
    if spctl --assess --type execute -vv "$app" 2>&1 | grep -q "Notarized Developer ID"; then
      ok "Gatekeeper: accepted, notarized by Apple"
    else
      warn "Gatekeeper did not report 'Notarized Developer ID' — do not trust this copy"
    fi
    local q; q="$(xattr -p com.apple.quarantine "$app" 2>/dev/null)"
    [ -n "$q" ] && info "Quarantine flag: $q" || info "No quarantine flag on the app bundle"
    local f where
    for f in "$HOME"/Downloads/OpenDex*.dmg "$HOME"/Downloads/OpenDex*.zip; do
      [ -e "$f" ] || continue
      where="$(mdls -raw -name kMDItemWhereFroms "$f" 2>/dev/null | tr -d '\n' | tr -s ' ')"
      info "Download $f came from: $where"
      echo "$where" | grep -q "github.com/wassgha/opendex" && ok "Origin is the official GitHub repo" ||
        warn "Origin is NOT github.com/wassgha/opendex — verify before trusting"
    done
    info "Entitlements:"
    codesign -d --entitlements - --xml "$app" 2>/dev/null | grep -o '<key>[^<]*</key>' |
      sed -e 's/<[^>]*>//g' -e 's/^/           /'
  fi

  # ------------------------------------------------------------------ config
  section "4. OpenDex configuration (no secret values)"
  local cfgdir="$HOME/Library/Application Support/OpenDex"
  if [ ! -d "$cfgdir" ]; then
    warn "Config dir not found: $cfgdir"
  else
    info "Config dir: $cfgdir"
    cat > "$TMPDIR_DX/cfg.js" <<'JXA'
ObjC.import('Foundation');
function readText(p) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}
function pick(o, path) {
  var parts = path.split('.');
  for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
  return o;
}
function run(argv) {
  var dir = argv[0], out = [];
  var fields = ['llm.provider', 'llm.model', 'voice.mode', 'realtime.provider', 'realtime.model',
    'realtime.voice', 'realtime.idleDisconnectSec', 'voiceInput.wakeMode', 'voiceInput.sttProvider',
    'voiceInput.whisperModel', 'assistant.name', 'assistant.wakeWord', 'assistant.userGender',
    'tts.engine', 'skills.enabled', 'skills.permissions', 'analytics.enabled', 'onboarding.completed'];
  var c = readText(dir + '/config.json');
  if (c === null) { out.push('config.json: not found (defaults in use)'); }
  else {
    var j;
    try { j = JSON.parse(c); } catch (e) { return 'config.json: INVALID JSON (' + e + ')'; }
    for (var i = 0; i < fields.length; i++) out.push(fields[i] + ' = ' + JSON.stringify(pick(j, fields[i])));
    var persona = (j.assistant && j.assistant.persona) || '';
    out.push('assistant.persona = ' + (persona.trim() ? '(custom, ' + persona.length + ' chars)' : '(built-in)'));
  }
  var s = readText(dir + '/secrets.json');
  if (s === null) { out.push('secrets.json: not found -> NO API keys stored'); }
  else {
    try {
      var sj = JSON.parse(s);
      out.push('secrets.enc (Keychain-encrypted) = ' + sj.enc);
      out.push('stored secret NAMES = ' + Object.keys(sj.values || {}).join(', '));
    } catch (e) { out.push('secrets.json: INVALID JSON'); }
  }
  return out.join('\n');
}
JXA
    osascript -l JavaScript "$TMPDIR_DX/cfg.js" "$cfgdir" 2>&1 | sed 's/^/  [INFO] /' | tee "$TMPDIR_DX/cfg.out"
    grep -q 'secrets.enc (Keychain-encrypted) = false' "$TMPDIR_DX/cfg.out" &&
      warn "Secrets are only base64-obfuscated, NOT encrypted (Keychain unavailable)"
    grep -q 'stored secret NAMES = .*AI_GATEWAY_API_KEY' "$TMPDIR_DX/cfg.out" &&
      ok "AI_GATEWAY_API_KEY is stored" || warn "AI_GATEWAY_API_KEY not found in OpenDex's store"
    grep -q '"xai/grok-voice-think-fast-1.0"' "$TMPDIR_DX/cfg.out" &&
      warn "realtime.model is xai/grok-voice-think-fast-1.0 — no longer listed by the gateway"
    grep -q 'whisperModel = ".*\.en"' "$TMPDIR_DX/cfg.out" &&
      info "Local Whisper model is English-only (.en) — affects pipeline mode only"
    grep -q 'analytics.enabled = true' "$TMPDIR_DX/cfg.out" &&
      info "Anonymous usage analytics (Google Analytics) is ON — opt-out in Settings"
  fi

  # ------------------------------------------------------------- permissions
  section "5. macOS privacy permissions (TCC)"
  local db rows any=0
  for db in "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
            "/Library/Application Support/com.apple.TCC/TCC.db"; do
    rows="$(sqlite3 -readonly "$db" \
      "SELECT service, CASE auth_value WHEN 0 THEN 'DENIED' WHEN 2 THEN 'ALLOWED' WHEN 3 THEN 'LIMITED' ELSE auth_value END
       FROM access WHERE client='io.opendex.app';" 2>&1)"
    if echo "$rows" | grep -qi "unable to open\|authorization denied\|not permitted"; then
      continue
    fi
    any=1
    [ -n "$rows" ] && echo "$rows" | sed 's/^/  [INFO] /' || info "No entries in $(dirname "$db")"
  done
  if [ $any = 0 ]; then
    info "TCC database not readable (Terminal has no Full Disk Access — that is fine)."
    info "Check manually: System Settings > Privacy & Security > Microphone / Screen & System"
    info "Audio Recording / Accessibility -> is 'OpenDex' listed and switched on?"
  fi

  # ------------------------------------------------------ processes / network
  section "6. Processes, background items, connections"
  ps -axo pid,ppid,%cpu,%mem,etime,comm | awk 'NR==1 || tolower($0) ~ /opendex/' | grep -v awk | sed 's/^/  /'
  ls ~/Library/LaunchAgents /Library/LaunchAgents /Library/LaunchDaemons 2>/dev/null |
    grep -i opendex | sed 's/^/  [WARN] launchd item: /'
  info "Login items: check System Settings > General > Login Items (not readable without prompts)"
  info "Established TCP connections of OpenDex processes:"
  lsof -nP -iTCP -sTCP:ESTABLISHED 2>/dev/null | awk 'tolower($1) ~ /opendex/ {print "           " $1, $2, $9}' | sort -u

  # ----------------------------------------------------------------- network
  section "7. Network path to Vercel AI Gateway"
  scutil --proxy | grep -E 'HTTPSEnable|HTTPSProxy|ProxyAutoConfigEnable|ProxyAutoConfigURLString' |
    sed 's/^ */  [INFO] proxy: /'
  if scutil --proxy | grep -qE '(HTTPSEnable|ProxyAutoConfigEnable) : 1'; then
    warn "System proxy is active — OpenDex opens the realtime WebSocket from Node, which ignores it"
  fi
  scutil --nc list 2>/dev/null | grep -i connected | sed 's/^/  [INFO] VPN: /'
  systemextensionsctl list 2>/dev/null | grep -iE 'network|filter|proxy|vpn' | grep -i enabled |
    sed 's/^ */  [INFO] network extension: /'
  local ip
  ip="$(dscacheutil -q host -a name ai-gateway.vercel.sh 2>/dev/null | awk '/ip_address/ {print $2}' | head -3 | tr '\n' ' ')"
  [ -n "$ip" ] && ok "DNS ai-gateway.vercel.sh -> $ip" || warn "DNS lookup for ai-gateway.vercel.sh failed"
  curl -sS --max-time 15 -o "$TMPDIR_DX/models.json" \
    -w '  [INFO] GET /v1/models: HTTP %{http_code}, TLS verify=%{ssl_verify_result}, connect %{time_connect}s, TLS %{time_appconnect}s\n' \
    "$GATEWAY/v1/models" 2>&1
  local rt_model
  rt_model="$(sed -n 's/^  \[INFO\] realtime.model = "\(.*\)"$/\1/p' "$TMPDIR_DX/cfg.out" 2>/dev/null)"
  rt_model="${rt_model:-$RT_MODEL_DEFAULT}"
  if grep -qE "\"id\" *: *\"$rt_model\"" "$TMPDIR_DX/models.json" 2>/dev/null; then
    ok "Model $rt_model is listed by the gateway"
  else
    warn "Model $rt_model is NOT listed by the gateway"
  fi
  info "Unauthenticated realtime WebSocket handshake (free, expect HTTP 401):"
  ws_probe "$rt_model" ""
  [ "$(cat "$TMPDIR_DX/ws_status")" = "401" ] &&
    ok "Network, DNS, TLS and WebSocket upgrade to the gateway work"

  # -------------------------------------------------------------------- logs
  section "8. Logs"
  local logdir="$HOME/Library/Logs/OpenDex"
  if [ -d "$logdir" ]; then
    ls -la "$logdir" | sed 's/^/  /'
    [ -f "$logdir/main.log" ] && { info "Last 30 lines of main.log:"; tail -n 30 "$logdir/main.log" | sed 's/^/           /'; }
  else
    info "No $logdir (OpenDex only logs updater events to file)"
  fi
  ls -t "$HOME/Library/Logs/DiagnosticReports" 2>/dev/null | grep -i opendex | head -5 |
    sed 's/^/  [WARN] crash report: /'
  info "Unified log, last 30 min, errors from OpenDex processes:"
  log show --last 30m --style compact --predicate 'process BEGINSWITH "OpenDex"' 2>/dev/null |
    grep -iE 'error|fail|denied|websocket|tcc' | tail -n 25 | sed 's/^/           /'

  # --------------------------------------------------------------- auth test
  if [ $AUTH_TEST = 1 ]; then
    section "9. Key / billing / realtime handshake test"
    printf '\nPaste your Vercel AI Gateway key (input hidden, not stored): ' > /dev/tty
    IFS= read -r -s DX_KEY < /dev/tty
    printf '\n' > /dev/tty
    DX_KEY="$(printf '%s' "$DX_KEY" | tr -d '[:space:]')"
    if [ -z "$DX_KEY" ]; then
      warn "No key entered — skipped"
    else
      info "GET /v1/credits (free, checks key + balance):"
      printf 'header = "Authorization: Bearer %s"\n' "$DX_KEY" |
        curl -sS --config - --max-time 15 -w '\n  [INFO] -> HTTP %{http_code}\n' "$GATEWAY/v1/credits" 2>&1 |
        sed 's/^{/  [INFO] {/'
      info "Realtime WebSocket handshake with key (no audio, no prompt, closed after 6 s):"
      ws_probe "$rt_model" "$DX_KEY"
      case "$(cat "$TMPDIR_DX/ws_status")" in
        101) ok "Gateway accepts key + model for realtime. Cause is inside the app / per-app network filter." ;;
        401) warn "Key rejected (invalid, revoked, or a different key than in OpenDex)." ;;
        402|403) warn "Account/billing restriction — see error text above (credits, payment method, free tier)." ;;
        400|404) warn "Model id / endpoint rejected — see error text above." ;;
        000) warn "No response — network/proxy/firewall problem." ;;
      esac
    fi
    unset DX_KEY
  fi

  section "Done"
  echo "Report: $REPORT"
}

main 2>&1 | redact | tee "$REPORT"
