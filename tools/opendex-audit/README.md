# OpenDex Audit (macOS Intel)

Befunde aus der Analyse des OpenDex-Quellcodes (v1.1.14, die aktuell neueste Version, Stand 29.10.2026),
der verwendeten Gateway-SDK (`@ai-sdk/gateway@4.0.0-canary.107`) und Tests gegen das Vercel AI Gateway.
Diese Tests liefen **ohne deinen Key** und ohne kostenpflichtige Anfragen.
Alles, was nur auf deinem Mac prüfbar ist, erledigt `opendex-diagnose.sh`.

## Ergebnis auf deinem Mac (29.10.2026)

Der Lauf auf dem MacBook Pro: Intel i5-8259U, macOS 15.7.5, OpenDex 1.1.14.

| # | Befund | Schwere | Lösung (nimmst du selbst vor) |
|---|---|---|---|
| 1 | **Realtime-Ursache:** Der Handshake liefert `403 customer_verification_required`, also *„AI Gateway requires a valid credit card on file“*. Der Key ist gültig (`/v1/credits` → 200), das Guthaben liegt bei 0. | Blocker | Im Vercel-Dashboard unter AI Gateway eine Kreditkarte hinterlegen. Das schaltet die Free-Credits frei; Auto-Top-up ist standardmäßig aus. Ob `gpt-realtime-2` mit Free-Credits nutzbar ist, ist nicht belegt (der Free-Tier umfasst nur einen Teil der Modelle). Danach `--auth-test` erneut ausführen: 101 = gelöst. Kommt dann ein 403 mit Free-Tier-Hinweis, musst du Credits kaufen und am besten ein Budget setzen. |
| 2 | `voice.mode = "pipeline"`: Realtime ist derzeit gar nicht aktiv. | Info | Nach Fix 1 unter Settings → Voice mode auf *Realtime* stellen. |
| 3 | **Keys nur base64, nicht verschlüsselt** (`secrets.enc = false`). OpenDex bekam beim Speichern keinen Zugriff auf den Schlüsselbund. Wahrscheinlich wurde die Schlüsselbund-Abfrage abgelehnt; das ist nicht sicher belegt. | Sicherheit | In der Schlüsselbundverwaltung nach „OpenDex Safe Storage“ suchen. OpenDex neu starten und eine Schlüsselbund-Abfrage mit *Immer erlauben* bestätigen. Dann einen Key in den Settings neu speichern: OpenDex schreibt alle Keys neu und verschlüsselt sie, sobald der Schlüsselbund verfügbar ist. Prüfen mit dem Skript (`secrets.enc = true`). Die Keys optional rotieren. |
| 4 | `tts.engine = "elevenlabs"`, aber kein `ELEVENLABS_API_KEY`. Im Pipeline-Modus bleiben Antworten stumm, weil es keinen Fallback gibt (`tts-player.ts` loggt den Fehler nur). | Funktion | Settings → Voice (TTS) → *System* wählen oder einen ElevenLabs-Key eintragen. Im Realtime-Modus spielt das keine Rolle. |
| 5 | STT `whisper-local` mit `base.en` versteht im Pipeline-Modus nur Englisch. | Funktion | Realtime nutzen oder unter Settings → Voice input die STT auf *OpenAI* stellen (Cloud, kostenpflichtig, mehrsprachig). |
| 6 | Wake Word „Remo“ ist im Wortschatz des Vosk-Modells enthalten (geprüft im Modell selbst). | ✅ | — |
| 7 | Signatur: *Developer ID Application: Wassim Gharbi (MB77Q72B78)*, notarisiert. Download von den offiziellen GitHub-Releases. | ✅ | — |
| 8 | Mikrofon erlaubt. Bildschirmaufnahme und Bedienungshilfen sind nicht freigegeben; das passt, weil `computer` aus ist. | ✅ | Erst freigeben, wenn du Computersteuerung bewusst aktivierst. |
| 9 | Das Terminal hat Festplattenvollzugriff (sonst wäre TCC.db nicht lesbar). | Info | Nicht nötig für OpenDex. Bei Bedarf in den Systemeinstellungen entziehen. |
| 10 | Die Unified-Log-Einträge (TCC-Requests, `AXTTSResourceManager`) sind normal und gutartig. | ✅ | — |

## Kostenlos-Setup: lokal, ohne Karte, ohne API-Kosten

Realtime-Voice ist bei Vercel nicht kostenlos zu bekommen (Kreditkarte nötig). Apple Intelligence läuft nur auf Apple Silicon. Komplett kostenlos geht auf deinem Intel-Mac deshalb nur der **Pipeline-Modus mit lokalen Modellen**:

| Baustein | Kostenlos-Variante | Getestet |
|---|---|---|
| Wake Word | Vosk, „Remo“ | „remo“ steht im Modell-Wortschatz |
| Spracherkennung | Whisper lokal, **mehrsprachiges** Modell (`Xenova/whisper-small` oder `-base`) | Die Modelle existieren. OpenDex übergibt keine Sprache, also erkennt Whisper sie automatisch. In OpenDex selbst nicht getestet. |
| Sprachmodell | **Ollama** + `qwen2.5:7b` über OpenDex' *Anthropic*-Anbindung | ✅ (siehe unten) |
| Sprachausgabe | macOS-Systemstimme | — |

**Warum der Umweg über „Anthropic“?** OpenDex' OpenAI-Anbindung nutzt die Responses-API mit gespeichertem Verlauf (`item_reference`). Ollama lehnt das ab der zweiten Frage ab (getestet). Die Anthropic-Anbindung ist zustandslos. Ollama spricht dieses Protokoll, und `ANTHROPIC_BASE_URL` lässt sich per Umgebungsvariable umlenken. Für xAI gibt es keine solche Variable.

**Testergebnisse** (gleiche Bibliotheksversionen wie OpenDex 1.1.14, CPU mit 4 Kernen ohne GPU, ähnlich deinem i5):

| Modell | Sprachwahl DE/EN/AR | Tools + mehrere Turns | Antwortzeit (warm) | Fazit |
|---|---|---|---|---|
| `qwen2.5:3b` | fehlerhaft, Arabisch unbrauchbar | ✅ | 1–5 s | zu schwach |
| **`qwen2.5:7b`** | ✅ mit der Persona unten | ✅ | 2–4 s, mit Tool bis ~18 s | **Empfehlung** |
| `qwen3:8b` | Arabisch endlos wiederholt | — | 30+ s (denkt trotz `/no_think`) | zu langsam |

Der erste Aufruf nach dem Start lädt das Modell und dauert 15–50 s. Auch `qwen2.5:7b` hat im Test Wetterdetails erfunden („Gewitter“, obwohl das Tool „bewölkt“ lieferte).

### Einrichtung

1. **Ollama installieren** (offiziell: ollama.com; ab macOS 14, auf Intel nur CPU). Danach im Terminal:
   ```bash
   ollama pull qwen2.5:7b
   ```
   Das sind ca. 4,7 GB Download und ca. 5 GB RAM im Betrieb. Ollama lauscht nur auf `localhost`. Nicht mit `OLLAMA_HOST=0.0.0.0` freigeben.
2. **OpenDex über Tray → Quit beenden**, dann das Whisper-Modell auf ein mehrsprachiges umstellen. Mit Backup, also umkehrbar:
   ```bash
   cd ~/Library/Application\ Support/OpenDex && cp config.json config.json.bak && sed -i '' 's#"Xenova/whisper-base.en"#"Xenova/whisper-small"#' config.json
   ```
   `whisper-small` ist genauer (wichtig für Arabisch), aber langsamer. `Xenova/whisper-base` ist schneller.
3. **OpenDex lokal starten:**
   ```bash
   bash opendex-local.sh
   ```
4. **In den Settings:**
   - *Language model*: Provider **Anthropic**, Modell **Custom…** → `qwen2.5:7b`. Als Anthropic-Key einen Platzhalter eintragen, z. B. `ollama`. Er geht nur an `localhost`.
   - *Voice mode*: **Pipeline**.
   - *Voice (TTS)*: **System**, eine Stimme wählen.
   - *Assistant → Persona*: den Text unten einfügen.
5. **Rückweg:** OpenDex normal starten (ohne Skript) und den Provider zurückstellen. Die Config stellst du mit `cp config.json.bak config.json` wieder her.

### Grenzen der Kostenlos-Variante

- **Nur eine Systemstimme für alle Sprachen.** OpenDex wählt keine Stimme pro Sprache. Mit einer deutschen Stimme klingen englische Antworten nach Akzent, und arabische Antworten werden vermutlich nicht sinnvoll vorgelesen. Arabisch *verstehen* geht, Arabisch *sprechen* praktisch nicht.
- **Kein natürliches Echtzeit-Gespräch:** Wake Word → Aufnahme → Whisper → LLM → Systemstimme. Pro Runde sind es mehrere Sekunden.
- **Keine Computersteuerung:** Dafür braucht OpenDex ein Modell mit Bildverständnis. `qwen2.5:7b` kann keine Screenshots lesen.

### Persona (getestet mit qwen2.5:7b, passt auch für Realtime)

```
You are Dex, a warm and concise voice assistant. Keep replies to one or two short sentences.
LANGUAGE RULE (most important): reply in the SAME language as the user's latest message.
- User writes German -> reply in German.
- User writes English -> reply in English.
- User writes Arabic -> reply in Syrian colloquial Arabic (شامي), e.g. "منيح", "شو", "هلق", "كتير".
Never answer in Arabic unless the user's latest message is in Arabic.
```

Die erste, lockerere Persona-Fassung (weiter unten) brachte `qwen2.5:7b` dazu, auch auf Deutsch und Englisch arabisch zu antworten.

## Diagnose-Skript

```bash
bash opendex-diagnose.sh
```

- Das Skript liest nur: Es ändert keine Einstellungen, Berechtigungen oder OpenDex-Dateien.
- Es liest **keine** Key-Werte aus OpenDex. Aus `secrets.json` gibt es nur die *Namen* der gespeicherten Keys aus.
  Zusätzlich schwärzt ein Filter alles, was wie ein Key aussieht (`vck_…`, `sk-…`, `Bearer …`).
- Den Bericht schreibt es als `opendex-report-<datum>.txt` ins aktuelle Verzeichnis. Per `.gitignore` wird er nie committet.

Optional gibt es den entscheidenden Test für den Realtime-Fehler, nur nach deiner Freigabe:

```bash
bash opendex-diagnose.sh --auth-test
```

Dabei fragt das Skript den Gateway-Key ab. Die Eingabe ist unsichtbar und wird weder gespeichert noch in Prozesslisten sichtbar. Dann prüft es:
1. `GET /v1/credits`: Ist der Key gültig, und wie hoch ist das Guthaben? Diese Abfrage ist kostenlos.
2. Den WebSocket-Handshake zu `openai/gpt-realtime-2`, genau so, wie OpenDex ihn aufbaut. Es wird kein Audio und kein Text gesendet, und es wird keine Antwort angefordert. Nach 6 s schließt das Skript die Verbindung.
   Laut Gateway-Preisliste wird `gpt-realtime-2` nur pro Token abgerechnet, ohne Minutenpreis. Erwartete Kosten: **0 $**.

## 1. Ursache von „Realtime connection failed — please try again.“

| Befund | Beleg |
|---|---|
| Die Meldung entsteht **nur**, wenn der WebSocket schließt, bevor er offen war. | `src/main/agent/realtime/session-host.ts:97-104` |
| `getToken()` führt **keinen** Netzwerkaufruf aus. Es gibt den rohen Key und die URL zurück. Vor dem Handshake wird also nichts geprüft. | SDK `GatewayRealtimeModel.doCreateClientSecret` |
| Ein Key ist in OpenDex hinterlegt. Ohne Key käme stattdessen „I need a Vercel AI Gateway key…“. | `gateway-token.ts` |
| Das Gateway nennt den genauen Grund als HTTP-Status beim Handshake (401/403/…). Die WebSocket-API verschluckt diesen Status, und OpenDex loggt ihn nicht. Daher kommt die generische Meldung. | Test ohne Key: `401 Missing Authorization header` |
| Endpoint `wss://ai-gateway.vercel.sh/v4/ai/realtime-model` existiert und antwortet. | Test 29.10.2026 |
| `openai/gpt-realtime-2` ist im Gateway gelistet (`type: realtime`, Tag `websocket-realtime`). Modell-ID und Protokoll von v1.1.14 sind gültig. | `GET /v1/models` |
| Das Mikrofon ist **nicht** die Ursache dieser Meldung: Der Fehler tritt im Main-Prozess auf, bevor Audio fließt. | Code-Pfad |

**Verbleibende Ursachen, nach Wahrscheinlichkeit:**

1. **Key ungültig, widerrufen, von einem anderen Team oder veraltet** → HTTP 401
2. **Billing**: keine Zahlungsmethode hinterlegt, Free-Credits gesperrt oder Guthaben 0 → HTTP 402/403
3. **Netzwerk**: OpenDex öffnet den WebSocket aus Node. Node ignoriert den macOS-System-Proxy.
   Auch Per-App-Firewalls (Little Snitch, LuLu), VPNs und Uni-Netze (eduroam) können WebSockets blockieren.
4. Eine selten auftretende, vorübergehende Gateway-Störung

### Fix je nach Ergebnis von `--auth-test`

| Handshake | Bedeutung | Lösung (nimmst du selbst vor) |
|---|---|---|
| **101** | Key, Billing und Modell sind ok | Den Key in OpenDex neu eintragen: Settings → Voice mode. Danach OpenDex komplett beenden (Tray → Quit) und neu starten. Hilft das nicht: Per-App-Firewall/Proxy prüfen (Abschnitt 7 im Bericht). |
| **401** | Key wird abgelehnt | Im Vercel-Dashboard unter AI Gateway → API Keys einen neuen Key erzeugen und in OpenDex eintragen. Den alten Key widerrufen. |
| **402/403** | Konto-/Billing-Sperre | Den Fehlertext im Bericht lesen. Im Vercel-Dashboard eine Zahlungsmethode hinterlegen oder Credits kaufen. |
| **400/404** | Modell/Endpoint abgelehnt | Fehlertext prüfen. Kein Wechsel auf Grok (siehe unten). |
| **000** | Keine Antwort | DNS, Proxy, VPN oder Firewall (Abschnitt 7 im Bericht). |

## 2. Voice-Assistent: was OpenDex v1.1.14 tatsächlich kann

| Wunsch | Status | Details |
|---|---|---|
| Weibliche, natürliche Stimme | ✅ mit Einschränkung | Für `gpt-realtime-2` gibt es die Stimmen marin, cedar, alloy, echo, sage und verse. OpenAI ordnet den Stimmen offiziell kein Geschlecht zu. Marin wird meist als weiblich wahrgenommen, bitte selbst anhören. |
| Deutsch / Englisch / Arabisch | ⚠️ nur im Realtime-Modus | OpenDex hat **keine** Spracheinstellung. Im Realtime-Modus hört und spricht das Modell mehrsprachig. Im Pipeline-Modus sind alle lokalen Whisper-Modelle `.en` (nur Englisch), und das Vosk-STT ist `en-us`. Mehrsprachig geht dort nur mit dem STT-Provider „OpenAI“ (Cloud). |
| Syrisches Arabisch bevorzugen | ⚠️ nur per Persona | Einen Dialekt-Schalter gibt es nicht. Möglich ist nur eine Anweisung in der Persona (Text unten). Wie gut der Dialekt umgesetzt wird, ist nicht geprüft: selbst testen. |
| Wake Word | ✅ | Vosk nutzt das kleine Modell `en-us` (Wake Word „dex“, konfigurierbar). Das funktioniert unabhängig von der Gesprächssprache. Ein arabisches oder deutsches Wake Word wird mit diesem Modell nicht zuverlässig erkannt. Das Modell wird beim ersten Start von `ccoreilly.github.io` geladen (Drittanbieter). |
| Geringe Latenz | ✅ | Realtime (Speech-to-Speech) ist in OpenDex der schnellste Modus. |
| Gesprächskontext | ⚠️ nur innerhalb einer Session | Nach `idleDisconnectSec` Stille (Standard **10 s**) endet die Session, und die nächste startet **ohne Verlauf**. Wird der Wert erhöht (z. B. 60–120 s, muss unter 300 s bleiben), bleibt der Kontext länger erhalten. Dafür wächst mit längeren Sessions der berechnete Input-Kontext pro Antwort. |

### Persona-Vorschlag (Settings → Assistant → Persona, jederzeit wieder leerbar). Besser getestet ist die Fassung im Abschnitt „Kostenlos-Setup“.

```
You are Dex, a warm, calm and concise voice assistant with a friendly female persona.
Always reply in the language the user just spoke:
- German: natural everyday German.
- English: natural English.
- Arabic: Syrian / Levantine colloquial Arabic (Damascus dialect, شامي), not Modern Standard Arabic (فصحى), unless the user explicitly asks for MSA.
If the user mixes languages, answer in the dominant one. Never switch language on your own.
```

Die festen Sprechregeln (kurze Antworten, kein Markdown) hängt OpenDex weiterhin automatisch an.

## 3. Computersteuerung

- Der Skill `computer` ist ab Werk **aus**, und die Berechtigung steht auf „ask“, also Nachfrage bei jedem Aufruf.
- Er braucht **Bedienungshilfen** (Maus/Tastatur über nut-js) und **Bildschirmaufnahme** (Screenshots). Die Freigabe erteilst du unter Systemeinstellungen → Datenschutz & Sicherheit.
- Im Realtime-Modus werden Desktop-Aufgaben per `run_task` an den Pipeline-Agenten übergeben. Dafür muss zusätzlich der Chat-LLM-Provider (`llm.provider`/`llm.model`) funktionieren.
- Eine eigene VS-Code- oder Terminal-Integration gibt es nicht, nur generisches „Screenshot + Maus/Tastatur“. Tippen im Terminal heißt Befehle ausführen. Deshalb gilt:
  **Berechtigung für `computer` auf „ask“ lassen, nie „always“.** Der Realtime-Prompt weist das Modell an, Tools ohne Rückfrage aufzurufen (`system-prompt.ts`). Die Berechtigungsabfrage ist die einzige Bremse.

## 4. Sicherheit

| Punkt | Befund |
|---|---|
| Herkunft | Offizielle Builds gibt es nur unter `github.com/wassgha/opendex/releases`. Die Websuche fand eine README-Kopie auf `ithub.global.ssl.fastly.net` (Tippfehler-Domain von „github“): **nicht** von dort laden. Das Skript prüft die Download-Herkunft. |
| Signatur | Die Release-Konfiguration nutzt Developer-ID-Signatur, Hardened Runtime und Notarisierung. Das Skript prüft dies per `codesign`/`spctl` auf deinem Mac. |
| Entitlements | `allow-dyld-environment-variables`, `disable-library-validation` und `allow-unsigned-executable-memory` schwächen die Hardened Runtime. Bei Electron mit nativen Modulen ist das üblich, erleichtert aber Code-Injection durch andere lokale Malware. Für dich als Nutzer nicht änderbar. |
| Key-Speicherung | Die Keys liegen in `~/Library/Application Support/OpenDex/secrets.json`, über den Schlüsselbund verschlüsselt (`safeStorage`). Ohne Schlüsselbund wären sie nur base64-kodiert. Das Skript prüft `enc`. Der Key bleibt im Main-Prozess und erreicht den Renderer nie. |
| Realtime-Auth | Der Code-Kommentar spricht von einem „kurzlebigen Token“. Tatsächlich sendet die SDK den **dauerhaften Key** als WebSocket-Subprotokoll. Das ist per TLS geschützt, aber kein ephemerer Token. |
| Telemetrie | Google Analytics ist **standardmäßig an**. Laut Code ist es anonym (Version, OS, genutzte Features/Modelle, keine Prompts, Audio oder Keys). Abschalten unter Settings → Privacy → „Anonymous usage data“. |
| Hintergrund | Tray-Icon, globale Hotkeys (⌥Space) und ein stündlicher Update-Check gegen GitHub. Updates werden automatisch geladen und beim Beenden installiert. Im Code gibt es weder LaunchAgent noch Login-Item. |

## 5. Weitere Befunde

- **Grok-Realtime ist defekt**: `xai/grok-voice-think-fast-1.0` ist im Gateway nicht mehr gelistet (heute heißt es `spacexai/grok-voice-think-fast-2.0`). Ein Wechsel darauf ist kein Workaround.
- **Logs sind wenig ergiebig**: OpenDex schreibt nur Updater-Ereignisse nach `~/Library/Logs/OpenDex/main.log`. Realtime-Fehler landen dort nicht. Deshalb gibt es den Handshake-Test im Skript.
