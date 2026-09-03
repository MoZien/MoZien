package de.mozien.cleantube.model;

import java.time.Instant;

/**
 * Vollstaendige Daten der Wiedergabeseite.
 *
 * @param id              YouTube-Video-ID
 * @param title           Videotitel
 * @param description     Beschreibungstext des Creators
 * @param channelId       ID des veroeffentlichenden Kanals
 * @param channelTitle    Name des Kanals
 * @param publishedAt     Veroeffentlichungszeitpunkt
 * @param durationSeconds Laufzeit in Sekunden; {@code null} bei Livestreams
 * @param viewCount       Aufrufe
 * @param likeCount       Likes; {@code null}, wenn der Creator sie ausgeblendet hat
 * @param live            {@code true} bei laufendem Livestream
 */
public record VideoDetails(
        String id,
        String title,
        String description,
        String channelId,
        String channelTitle,
        Instant publishedAt,
        Long durationSeconds,
        Long viewCount,
        Long likeCount,
        boolean live) {
}
