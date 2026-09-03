package de.mozien.cleantube.model;

import java.time.Instant;

/**
 * Kompakte Darstellung eines Videos fuer Listen (Startseite, Suche, Kanalseite).
 *
 * <p>Bewusst reduziert: Nur was fuer eine Kachel gebraucht wird. Die Roh-Antworten der
 * YouTube-API werden nie direkt nach aussen gereicht, damit das Frontend von
 * API-Aenderungen entkoppelt bleibt.
 *
 * <p>Die Laufzeit steht als Sekundenzahl im Vertrag und nicht als {@code Duration}:
 * Wie Jackson eine {@code Duration} schreibt, haengt an globalen Schaltern
 * ({@code WRITE_DURATIONS_AS_TIMESTAMPS}). Eine schlichte Zahl ist eindeutig,
 * im Browser ohne Zusatzbibliothek verwendbar und macht den Vertrag hier im
 * Quelltext sichtbar.
 *
 * @param id             YouTube-Video-ID
 * @param title          Videotitel
 * @param channelId      ID des veroeffentlichenden Kanals
 * @param channelTitle   Name des Kanals
 * @param thumbnailUrl   Vorschaubild in der besten verfuegbaren Aufloesung
 * @param publishedAt    Veroeffentlichungszeitpunkt
 * @param durationSeconds Laufzeit in Sekunden; {@code null}, wenn die API sie nicht
 *                        mitliefert (z. B. bei {@code search.list} oder Livestreams)
 * @param viewCount      Aufrufe; {@code null}, wenn nicht verfuegbar
 * @param live           {@code true}, wenn es sich um einen laufenden Livestream handelt
 */
public record VideoSummary(
        String id,
        String title,
        String channelId,
        String channelTitle,
        String thumbnailUrl,
        Instant publishedAt,
        Long durationSeconds,
        Long viewCount,
        boolean live) {

    /** Ergaenzt eine Zusammenfassung um Werte, die erst ein zweiter API-Aufruf liefert. */
    public VideoSummary withDetails(Long durationSeconds, Long viewCount, boolean live) {
        return new VideoSummary(id, title, channelId, channelTitle, thumbnailUrl,
                publishedAt, durationSeconds, viewCount, live);
    }
}
