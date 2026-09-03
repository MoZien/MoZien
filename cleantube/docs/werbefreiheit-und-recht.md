# Werbefreiheit und rechtlicher Rahmen

Die Aufgabenstellung lautete: „eine App, die mit YouTube verbunden ist, aber ohne Werbung“.
Dieses Dokument klärt, was davon technisch möglich, was rechtlich zulässig und was in
CleanTube tatsächlich umgesetzt ist. Die Unterscheidung ist der fachliche Kern des Projekts.

## 1. Drei Arten von Werbung

Der Begriff „Werbung bei YouTube“ meint drei völlig verschiedene Dinge:

### a) Werbung der Plattform

Anzeigen, die YouTube ausliefert: Pre-Roll vor dem Video, Mid-Roll mittendrin,
Banner-Overlays, gesponserte Suchtreffer. Sie sind Teil von YouTubes Geschäftsmodell und
werden vom Player selbst geladen.

### b) Werbung der App

Anzeigen, die ein Client zusätzlich einblendet: eigene Banner, Tracking für
Werbenetzwerke, „Gesponsert“-Kacheln im Feed. Auch die algorithmische
Aufmerksamkeitsbindung gehört in diese Kategorie – der Empfehlungs-Feed, der automatisch
zum nächsten Video weiterläuft, ist ökonomisch dasselbe wie Werbung: Er verkauft Zeit.

### c) Werbung im Video

Blöcke, die der Creator **selbst in die Videodatei geschnitten** hat: „Dieses Video wird
gesponsert von …“, Hinweise auf eigenen Merch, Aufrufe zum Abonnieren. YouTube kennt diese
Abschnitte gar nicht als Werbung – für die Plattform sind sie normaler Videoinhalt.

## 2. Was CleanTube tut

| Art | Umsetzung |
|---|---|
| a) Plattform-Werbung | **wird nicht umgangen** |
| b) App-Werbung | **existiert nicht** – keine Anzeigen, kein Tracking, kein Empfehlungs-Sog |
| c) Werbung im Video | **wird übersprungen** – über SponsorBlock, abschaltbar |

### Zu b): vollständig erreichbar

Das ist der Teil, der zu 100 % umsetzbar ist – und der in der Praxis den größten Unterschied
macht:

- keine Werbeflächen, keine gesponserten Einblendungen
- kein Analytics, keine Werbe-Skripte, keine Fremd-Fonts
- kein Empfehlungs-Feed, kein Autoplay ins nächste Video
- keine Shorts-Endlosschleife
- `rel=0` und `iv_load_policy=3` im Player: keine fremden Videovorschläge, keine
  eingeblendeten Annotationen
- keine Nutzerkonten, keine personenbezogenen Daten

Die Startseite zeigt bewusst nur *aktuell beliebte* Videos statt eines personalisierten Feeds.
Wer die App verlässt, verlässt sie – ohne dass ein Algorithmus den nächsten Klick vorbereitet.

### Zu c): SponsorBlock

[SponsorBlock](https://sponsor.ajay.app/) ist eine offene Community-Datenbank. Nutzer melden
Zeitbereiche, in denen ein Creator Werbung ins eigene Video geschnitten hat; andere Nutzer
bestätigen oder widersprechen.

CleanTube fragt diese Zeitbereiche ab und springt im Player über sie hinweg – **über die
offizielle Methode `seekTo()` des IFrame-Players**, also genau so, wie ein Mensch vorspulen
würde. Es wird kein Netzwerk-Request blockiert und nichts an YouTubes Auslieferung verändert.

Umgesetzte Details:

- ein-/ausschaltbar, Zustand pro Video sichtbar
- „Rückgängig“ im Hinweis, falls jemand den Abschnitt doch sehen will
- Übersicht aller Abschnitte unter dem Video – transparent statt heimlich
- nur Segmente vom Typ `skip`; `mute` und `poi` bedeuten etwas anderes und werden ignoriert
- fällt die Community-API aus, läuft das Video normal weiter

## 3. Warum a) nicht umgangen wird

### Die technischen Wege – und warum sie ausscheiden

| Ansatz | Wie es funktionieren würde | Problem |
|---|---|---|
| Stream-Extraktion (`yt-dlp`-Prinzip) | interne Endpunkte nachbauen, direkte Video-URL ziehen | umgeht den Player vollständig; klarer ToS-Verstoß |
| Proxy-Frontend (Invidious, Piped) | eigener Server holt Videos und reicht sie durch | gleicher Verstoß, zusätzlich hohe Traffic-Kosten |
| Anzeigen-Requests blockieren | Netzwerkfilter im Client | greift gezielt in die Anzeigenauslieferung ein |
| DOM-Manipulation im Player | Anzeigenelemente ausblenden, Skip-Button klicken | Verdecken/Verändern von Anzeigen; zusätzlich Cross-Origin nicht möglich |

### Die rechtliche Lage

Wer die YouTube Data API nutzt, akzeptiert die
[YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
und die
[YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies).
Für dieses Projekt sind vor allem drei Punkte einschlägig:

1. **Werbung.** Die Developer Policies untersagen es, Anzeigen im eingebetteten Player zu
   verändern, zu ersetzen, zu blockieren oder zu verdecken. Auch das Einblenden eigener
   Werbung über oder um den Player herum ist geregelt.
2. **Kein Umgehen des Players.** Videoinhalte dürfen nicht separat vom offiziellen Player
   abgerufen, heruntergeladen oder zwischengespeichert werden.
3. **Keine Umgehung technischer Schutzmaßnahmen.** Das gilt zusätzlich zu den
   [allgemeinen Nutzungsbedingungen von YouTube](https://www.youtube.com/t/terms).

Ein Verstoß führt zur Sperrung des API-Keys und des dahinterliegenden Google-Kontos. Bei
einer Hochschularbeit hängt daran in der Regel ein privates Konto.

Hinzu kommt die urheberrechtliche Seite: Nach § 95a UrhG ist die Umgehung wirksamer
technischer Schutzmaßnahmen unzulässig. Ob YouTubes Anzeigenauslieferung darunterfällt, ist
juristisch umstritten – aber genau diese Unsicherheit ist ein Grund, sie in einer
Prüfungsleistung nicht zum Kern zu machen.

### Die pragmatische Seite

Anwendungen, die YouTubes Anzeigenauslieferung umgehen, funktionieren nicht dauerhaft.
YouTube ändert die internen Endpunkte regelmäßig; Projekte wie NewPipe oder Invidious
brauchen deshalb ständige Anpassungen und fallen wiederholt für Wochen aus. Eine Abgabe, die
im Prüfungszeitraum nicht mehr läuft, ist auch fachlich kein gutes Ergebnis.

## 4. Was ist mit YouTube Premium?

Der einzige von YouTube vorgesehene Weg zu werbefreier Wiedergabe ist ein Premium-Abo. Ist ein
Nutzer in seinem Browser bei einem Premium-Konto angemeldet, greift das auch im eingebetteten
Player – CleanTube ist dann für diesen Nutzer vollständig werbefrei, ohne dass die Anwendung
etwas dafür tun müsste.

Das ist keine Ausrede, sondern eine ehrliche Einordnung: Die App ist so gebaut, dass sie mit
Premium vollständig werbefrei ist und ohne Premium immer noch **frei von App-Werbung,
Tracking, Empfehlungs-Sog und In-Video-Sponsoring** – also von allem, worauf ein Client
überhaupt Einfluss hat.

## 5. Einordnung für die Abgabe

Die Formulierung „ohne Werbung“ ist mehrdeutig, und genau diese Mehrdeutigkeit aufzulösen ist
Teil der fachlichen Leistung. Drei Punkte lassen sich in einer Präsentation gut vertreten:

1. **Präzisierung der Anforderung.** Aus „ohne Werbung“ wurden drei unterscheidbare
   Anforderungen mit unterschiedlichem Erfüllungsgrad — das ist Anforderungsanalyse, nicht
   Ausweichen.
2. **Bewusste Abwägung.** Der technisch mögliche Weg wurde geprüft und aus rechtlichen,
   betrieblichen und Wartbarkeitsgründen verworfen. Die Begründung ist dokumentiert und
   nachvollziehbar.
3. **Maximale Umsetzung im zulässigen Rahmen.** Was ohne Verstoß erreichbar war, ist
   vollständig umgesetzt – inklusive der Punkte (Datenschutz, Ablenkungsfreiheit,
   Quota-Management), die ein reiner Adblocker gar nicht adressiert.

## Quellen

- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube Nutzungsbedingungen](https://www.youtube.com/t/terms)
- [YouTube Data API v3 – Quota-Kosten](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [SponsorBlock – API und Datenschutz](https://sponsor.ajay.app/)
- [§ 95a UrhG – Schutz technischer Maßnahmen](https://www.gesetze-im-internet.de/urhg/__95a.html)
