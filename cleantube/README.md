# CleanTube

Ein werbefreier, ablenkungsfreier YouTube-Client auf Basis der **offiziellen YouTube Data API v3**.

Spring Boot 3.5 · Java 21 · Vanilla-JS-Frontend ohne Build-Schritt

---

## Was „ohne Werbung“ hier konkret heißt

Das ist die wichtigste Frage des Projekts, deshalb steht sie ganz oben. Bei YouTube gibt es
**drei verschiedene Arten von Werbung** – CleanTube behandelt sie unterschiedlich:

| Art der Werbung | Beispiel | CleanTube |
|---|---|---|
| **Werbung der Plattform** – Anzeigen, die YouTube ausliefert | Pre-Roll, Mid-Roll, Banner-Overlays | **wird nicht umgangen** (siehe unten) |
| **Werbung der App** – Anzeigen, die der Client selbst einblendet | Banner, Tracking, „Gesponsert“-Kacheln | **existiert hier gar nicht** |
| **Werbung im Video** – vom Creator selbst eingebaute Blöcke | „Dieses Video wird gesponsert von …“ | **wird übersprungen** (SponsorBlock) |

**Warum die erste Zeile so ist, wie sie ist:** YouTubes Anzeigenauslieferung technisch zu
umgehen – etwa durch Extraktion der Streaming-URLs, Proxy-Frontends oder das Blockieren von
Anzeigen-Requests – verstößt gegen die Nutzungsbedingungen von YouTube und gegen die
[YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies),
die das Verändern, Ersetzen oder Verdecken von Anzeigen im eingebetteten Player ausdrücklich
untersagen. Für eine Hochschularbeit ist das kein akademisches Risiko, sondern ein reales:
Der API-Key hängt an einem Google-Konto.

CleanTube geht deshalb den sauberen Weg — und der liefert erstaunlich viel: eine Oberfläche
ohne jede Werbefläche, ohne Empfehlungs-Sog, ohne Tracking, plus das Überspringen der
Sponsor-Blöcke, die YouTube selbst gar nicht als Werbung kennt.

Die ausführliche Begründung steht in [`docs/werbefreiheit-und-recht.md`](docs/werbefreiheit-und-recht.md).

---

## Funktionen

- **Startseite** mit aktuell beliebten Videos – bewusst *kein* personalisierter Empfehlungs-Feed
- **Volltextsuche** über die offizielle YouTube-Suche
- **Wiedergabe** über den offiziellen IFrame-Player, eingebettet über `youtube-nocookie.com`
- **Kanalseiten** mit chronologischer Upload-Liste
- **Sponsor-Abschnitte überspringen** über [SponsorBlock](https://sponsor.ajay.app/) – abschaltbar,
  mit „Rückgängig“-Möglichkeit und einer Übersicht, was übersprungen wird
- **Quota-Überwachung** mit sichtbarer Anzeige des Restkontingents
- **Keine Werbung, kein Tracking, keine Cookies** durch die Anwendung selbst

---

## Schnellstart

### 1. API-Key besorgen

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen und ein Projekt anlegen
2. Unter *APIs & Dienste → Bibliothek* die **YouTube Data API v3** aktivieren
3. Unter *APIs & Dienste → Anmeldedaten* einen **API-Schlüssel** erstellen
4. Empfohlen: Den Schlüssel auf die YouTube Data API v3 beschränken

Der Zugang ist kostenlos. Das Standardkontingent beträgt 10.000 Einheiten pro Tag.

### 2. Starten

```bash
export YOUTUBE_API_KEY=AIza...        # Windows: set YOUTUBE_API_KEY=AIza...
mvn spring-boot:run
```

Danach: <http://localhost:8080>

Ohne gesetzten Key bricht der Start bewusst mit einer klaren Meldung ab (Fail-Fast) – besser
als eine App, die erst beim ersten Klick unverständlich scheitert.

### 3. Alternativ mit Docker

```bash
docker build -t cleantube .
docker run -e YOUTUBE_API_KEY=AIza... -p 8080:8080 cleantube
```

---

## Das Quota-Konzept – die eigentliche Herausforderung

Die YouTube Data API rechnet jeden Aufruf in *Quota-Einheiten* ab. Ein Projekt hat
standardmäßig **10.000 Einheiten pro Tag**, und die Preise sind sehr ungleich verteilt:

| Aufruf | Kosten | Verwendung in CleanTube |
|---|---:|---|
| `search.list` | **100** | nur bei einer echten Suchanfrage |
| `videos.list` | 1 | Startseite, Detailseite, Anreicherung |
| `channels.list` | 1 | Kanal-Stammdaten |
| `playlistItems.list` | 1 | Videos eines Kanals |

Naiv gebaut wäre die App nach **100 Suchen am Tag** tot. Drei Entwurfsentscheidungen
verhindern das:

1. **Caching mit gestaffelter Lebensdauer.** Suchergebnisse werden 6 Stunden vorgehalten,
   günstige Abfragen 15 Minuten. Der Cache-Schlüssel einer Suche wird kleingeschrieben, damit
   „Spring Boot“ und „spring boot“ nicht zweimal bezahlt werden.
   → [`CacheConfig`](src/main/java/de/mozien/cleantube/config/CacheConfig.java)

2. **Kanalvideos über die Uploads-Playlist statt über die Suche.** Jeder Kanal hat eine
   automatisch gepflegte Playlist mit allen Uploads. Sie zu lesen kostet **1** statt **100**
   Einheiten. → [`YouTubeService#channelVideos`](src/main/java/de/mozien/cleantube/youtube/YouTubeService.java)

3. **Sammelabfragen statt Schleifen.** `search.list` liefert weder Laufzeit noch Aufrufzahlen.
   Diese werden für *alle* Treffer mit **einem einzigen** `videos.list`-Aufruf nachgeladen –
   eine Schleife über 25 Treffer würde dasselbe Ergebnis für das 25-Fache kosten.

Dazu kommt der [`QuotaGuard`](src/main/java/de/mozien/cleantube/youtube/QuotaGuard.java): Er
bucht jeden geplanten Aufruf vorab und lehnt ihn mit **HTTP 429** und einer verständlichen
Erklärung ab, wenn das Kontingent nicht reicht — statt den Nutzer in einen unerklärlichen
Fehler laufen zu lassen.

---

## Architektur in Kürze

```
Browser  ──►  Spring-Boot-Backend  ──►  YouTube Data API v3
(Vanilla JS)   (REST + Cache + Quota)   ──►  SponsorBlock-API
     │
     └────────►  YouTube IFrame-Player (youtube-nocookie.com)
```

**Der API-Key erreicht den Browser nie.** Alle Aufrufe laufen über das eigene Backend. Ein Key
im Frontend wäre über die Entwicklerwerkzeuge öffentlich einsehbar und ließe sich von Dritten
auf Kosten des Projekts verbrauchen.

Schichten:

| Paket | Aufgabe |
|---|---|
| `api` | REST-Endpunkte, Eingabeprüfung, Übersetzung von Ausnahmen in Statuscodes |
| `youtube` | Zugriff auf die Google-API, Caching, Quota, Mapping |
| `sponsorblock` | Anbindung der Community-API für Sponsor-Abschnitte |
| `model` | Nach außen sichtbare DTOs – entkoppeln das Frontend von der Google-API |
| `config` | Typsichere Konfiguration, Cache- und HTTP-Client-Einrichtung |

Ausführlich inklusive Sequenzdiagrammen und begründeter Entwurfsentscheidungen:
[`docs/architektur.md`](docs/architektur.md)

---

## REST-Schnittstelle

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/videos` | beliebte Videos (optional `?pageToken=`) |
| `GET` | `/api/videos/{videoId}` | Daten der Wiedergabeseite |
| `GET` | `/api/videos/{videoId}/skip-segments` | zu überspringende Abschnitte |
| `GET` | `/api/search?q=…` | Volltextsuche (optional `?pageToken=`) |
| `GET` | `/api/channels/{channelId}` | Kanal-Stammdaten |
| `GET` | `/api/channels/{channelId}/videos` | Videos eines Kanals |
| `GET` | `/api/status` | Quota-Stand und Funktionsschalter |
| `GET` | `/actuator/health` | Betriebszustand |
| `GET` | `/actuator/caches` | Cache-Übersicht |

Beispiel:

```bash
curl "http://localhost:8080/api/search?q=spring+boot" | jq
```

```json
{
  "items": [
    {
      "id": "dQw4w9WgXcQ",
      "title": "Ein Video",
      "channelId": "UC38IQsAvIsxxjztdMZQtwHA",
      "channelTitle": "Ein Kanal",
      "thumbnailUrl": "https://i.ytimg.com/…",
      "publishedAt": "2024-01-01T00:00:00Z",
      "durationSeconds": 213,
      "viewCount": 1500000,
      "live": false
    }
  ],
  "nextPageToken": "CAUQAA"
}
```

Fehler kommen einheitlich zurück:

```json
{
  "status": 429,
  "error": "quota_exceeded",
  "message": "Das Tageskontingent der YouTube-API ist aufgebraucht. Es wird um Mitternacht (UTC) zurueckgesetzt.",
  "timestamp": "2026-09-03T09:30:57.306Z"
}
```

---

## Tests

```bash
mvn test
```

55 Tests, die vollständig **offline** laufen – es wird kein API-Key benötigt und kein
Kontingent verbraucht:

| Testklasse | Prüft |
|---|---|
| `QuotaGuardTest` | Buchung, Ablehnung, Tageswechsel, Nebenläufigkeit |
| `YouTubeMapperTest` | Mapping inklusive fehlender Felder, Livestreams, gelöschter Uploads |
| `YouTubeClientTest` | ausgehende Parameter, Quota-Kosten, Übersetzung von API-Fehlern |
| `YouTubeServiceTest` | Anreicherung der Suchtreffer, Weg über die Uploads-Playlist |
| `SponsorBlockServiceTest` | Filterung, Sortierung, Robustheit bei Ausfall der API |
| `CatalogControllerTest` | Antwortformat, Eingabeprüfung, Statuscodes |
| `CleanTubeApplicationTests` | Kontextstart, Cache-Einrichtung, Konfiguration |

Die HTTP-Schicht wird mit `MockRestServiceServer` gegen eine Attrappe geprüft, die
Web-Schicht mit `MockMvc`.

---

## Konfiguration

Alles in [`src/main/resources/application.yml`](src/main/resources/application.yml),
typsicher gebunden in [`CleanTubeProperties`](src/main/java/de/mozien/cleantube/config/CleanTubeProperties.java).

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `YOUTUBE_API_KEY` | – | **erforderlich**, Umgebungsvariable |
| `CLEANTUBE_REGION` | `DE` | Region der Trending-Liste |
| `CLEANTUBE_SPONSORBLOCK` | `true` | SponsorBlock ein-/ausschalten |
| `cleantube.youtube.daily-quota` | `10000` | Tageskontingent |
| `cleantube.youtube.cache-ttl` | `15m` | Lebensdauer der günstigen Abfragen |
| `cleantube.youtube.search-cache-ttl` | `6h` | Lebensdauer der Suchergebnisse |

---

## Projektstruktur

```
cleantube/
├── docs/
│   ├── architektur.md                  Schichten, Sequenzen, Entwurfsentscheidungen
│   └── werbefreiheit-und-recht.md      Was „werbefrei“ heißt und was rechtlich gilt
├── src/main/java/de/mozien/cleantube/
│   ├── api/                            REST-Endpunkte und Fehlerbehandlung
│   ├── config/                         Konfiguration, Cache, HTTP-Clients, Uhr
│   ├── model/                          nach außen sichtbare DTOs
│   ├── sponsorblock/                   Anbindung der Community-API
│   └── youtube/                        Google-API, Caching, Quota, Mapping
├── src/main/resources/
│   ├── application.yml
│   └── static/                         Frontend ohne Build-Schritt
├── src/test/java/…                     55 Tests
├── Dockerfile
└── pom.xml
```

---

## Rechtliche Hinweise

- Nutzung ausschließlich über die offizielle **YouTube Data API v3** und den offiziellen
  **IFrame-Player**; es gelten die
  [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service).
- Anzeigen von YouTube werden **nicht** blockiert, verändert oder verdeckt.
- Es werden keine Videodaten heruntergeladen, zwischengespeichert oder weiterverbreitet;
  zwischengespeichert werden ausschließlich Metadaten, und das nur für Minuten bis Stunden.
- Die Einbettung erfolgt über `youtube-nocookie.com`; Cookies setzt YouTube erst beim
  tatsächlichen Start der Wiedergabe.
- SponsorBlock ist eine unabhängige Community-Datenbank
  ([Lizenz und Datenschutz](https://sponsor.ajay.app/)) und markiert ausschließlich von
  Creatorn selbst eingebaute Abschnitte.

Hochschulprojekt – nicht mit Google oder YouTube verbunden.
