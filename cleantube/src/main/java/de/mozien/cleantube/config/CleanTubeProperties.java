package de.mozien.cleantube.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;
import java.util.List;

/**
 * Zentrale, typsichere Konfiguration von CleanTube (Praefix {@code cleantube}).
 *
 * <p>Alle Werte lassen sich ueber {@code application.yml} oder Umgebungsvariablen setzen.
 * Der API-Key wird bewusst <b>nicht</b> im Repository abgelegt, sondern ueber die
 * Umgebungsvariable {@code YOUTUBE_API_KEY} injiziert.
 */
@Validated
@ConfigurationProperties(prefix = "cleantube")
public record CleanTubeProperties(YouTube youtube, SponsorBlock sponsorBlock) {

    /**
     * Konfiguration des Zugriffs auf die YouTube Data API v3.
     *
     * @param apiKey       API-Key aus der Google Cloud Console (Env: {@code YOUTUBE_API_KEY})
     * @param baseUrl      Basis-URL der API, fuer Tests ueberschreibbar
     * @param regionCode   ISO-3166-1-Laendercode fuer die Trending-Liste, z. B. {@code DE}
     * @param maxResults   Anzahl Treffer pro Seite (YouTube erlaubt maximal 50)
     * @param dailyQuota   Tageskontingent in Quota-Einheiten (Google-Standard: 10.000)
     * @param timeout      Lese-Timeout fuer HTTP-Aufrufe
     * @param cacheTtl     Wie lange Antworten zwischengespeichert werden
     * @param searchCacheTtl Eigene, laengere TTL fuer Suchen (kosten 100 Einheiten pro Aufruf)
     */
    public record YouTube(
            @NotBlank String apiKey,
            @NotBlank String baseUrl,
            @NotBlank String regionCode,
            @Min(1) int maxResults,
            @Min(1) int dailyQuota,
            Duration timeout,
            Duration cacheTtl,
            Duration searchCacheTtl) {
    }

    /**
     * Konfiguration der SponsorBlock-Anbindung.
     *
     * <p>SponsorBlock ist eine Community-Datenbank fuer <i>vom Creator selbst eingebaute</i>
     * Werbeblöcke (Sponsor-Reads, Eigenwerbung, Intros). Das hat nichts mit YouTubes eigener
     * Anzeigenauslieferung zu tun: Wir springen lediglich per Player-API im Video vorwaerts.
     *
     * @param enabled    Feature-Schalter; bei {@code false} liefert die API leere Segmente
     * @param baseUrl    Basis-URL der SponsorBlock-API
     * @param categories Kategorien, die uebersprungen werden sollen
     * @param timeout    Lese-Timeout fuer HTTP-Aufrufe
     * @param cacheTtl   Wie lange Segmente zwischengespeichert werden
     */
    public record SponsorBlock(
            boolean enabled,
            @NotBlank String baseUrl,
            List<String> categories,
            Duration timeout,
            Duration cacheTtl) {
    }
}
