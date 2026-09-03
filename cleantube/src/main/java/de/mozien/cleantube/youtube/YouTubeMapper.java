package de.mozien.cleantube.youtube;

import de.mozien.cleantube.model.ChannelInfo;
import de.mozien.cleantube.model.VideoDetails;
import de.mozien.cleantube.model.VideoSummary;
import de.mozien.cleantube.youtube.YouTubeResponses.ChannelItem;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistItem;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchItem;
import de.mozien.cleantube.youtube.YouTubeResponses.Snippet;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoItem;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;

/**
 * Uebersetzt die Roh-Antworten der YouTube-API in das Domaenenmodell der Anwendung.
 *
 * <p>Zustandslos und ohne eigene Abhaengigkeiten - dadurch vollstaendig ohne
 * Spring-Kontext testbar. Fehlende oder unerwartete Felder fuehren nie zu einer
 * Ausnahme, sondern zu {@code null}: Google liefert je nach Video unterschiedlich
 * viele Felder (verborgene Likes, Livestreams ohne Laufzeit, geloeschte Uploads).
 */
@Component
public class YouTubeMapper {

    /** Vollstaendiger Datensatz aus {@code videos.list}. */
    public VideoSummary toSummary(VideoItem item) {
        Snippet snippet = item.snippet();
        if (snippet == null) {
            return null;
        }
        return new VideoSummary(
                item.id(),
                snippet.title(),
                snippet.channelId(),
                snippet.channelTitle(),
                thumbnailUrl(snippet),
                parseInstant(snippet.publishedAt()),
                durationSeconds(item),
                item.statistics() != null ? item.statistics().viewCount() : null,
                snippet.isLive());
    }

    /**
     * Treffer aus {@code search.list}.
     *
     * <p>Laufzeit und Aufrufzahlen fehlen hier prinzipbedingt - die Suche liefert sie
     * nicht mit. Sie werden im {@link YouTubeService} nachgereicht.
     */
    public VideoSummary toSummary(SearchItem item) {
        Snippet snippet = item.snippet();
        if (snippet == null || item.id() == null || item.id().videoId() == null) {
            return null;
        }
        return new VideoSummary(
                item.id().videoId(),
                snippet.title(),
                snippet.channelId(),
                snippet.channelTitle(),
                thumbnailUrl(snippet),
                parseInstant(snippet.publishedAt()),
                null,
                null,
                snippet.isLive());
    }

    /**
     * Eintrag aus {@code playlistItems.list}.
     *
     * <p>Geloeschte oder privat gestellte Videos bleiben als Platzhalter in der Playlist
     * stehen; sie werden hier zu {@code null} und vom Aufrufer herausgefiltert.
     */
    public VideoSummary toSummary(PlaylistItem item) {
        Snippet snippet = item.snippet();
        String videoId = item.contentDetails() != null ? item.contentDetails().videoId() : null;
        if (snippet == null || videoId == null || thumbnailUrl(snippet) == null) {
            return null;
        }
        return new VideoSummary(
                videoId,
                snippet.title(),
                snippet.channelId(),
                snippet.channelTitle(),
                thumbnailUrl(snippet),
                parseInstant(snippet.publishedAt()),
                null,
                null,
                snippet.isLive());
    }

    /** Datensatz fuer die Wiedergabeseite. */
    public VideoDetails toDetails(VideoItem item) {
        Snippet snippet = item.snippet();
        if (snippet == null) {
            return null;
        }
        return new VideoDetails(
                item.id(),
                snippet.title(),
                snippet.description(),
                snippet.channelId(),
                snippet.channelTitle(),
                parseInstant(snippet.publishedAt()),
                durationSeconds(item),
                item.statistics() != null ? item.statistics().viewCount() : null,
                item.statistics() != null ? item.statistics().likeCount() : null,
                snippet.isLive());
    }

    /** Kanal-Stammdaten inklusive der ID der automatisch gepflegten Uploads-Playlist. */
    public ChannelInfo toChannelInfo(ChannelItem item) {
        Snippet snippet = item.snippet();
        if (snippet == null) {
            return null;
        }
        Long subscribers = null;
        Long videos = null;
        if (item.statistics() != null) {
            boolean hidden = Boolean.TRUE.equals(item.statistics().hiddenSubscriberCount());
            subscribers = hidden ? null : item.statistics().subscriberCount();
            videos = item.statistics().videoCount();
        }
        String uploads = item.contentDetails() != null && item.contentDetails().relatedPlaylists() != null
                ? item.contentDetails().relatedPlaylists().uploads()
                : null;
        return new ChannelInfo(
                item.id(),
                snippet.title(),
                snippet.description(),
                thumbnailUrl(snippet),
                subscribers,
                videos,
                uploads);
    }

    /**
     * Laufzeit eines Videos in Sekunden.
     *
     * @return {@code null}, wenn die API keine verwertbare Dauer liefert
     */
    public Long durationSeconds(VideoItem item) {
        if (item.contentDetails() == null) {
            return null;
        }
        Duration duration = parseDuration(item.contentDetails().duration());
        return duration != null ? duration.toSeconds() : null;
    }

    /**
     * Wandelt eine ISO-8601-Dauer wie {@code PT12M43S} in eine {@link Duration}.
     *
     * @return {@code null}, wenn kein oder ein unlesbarer Wert geliefert wurde
     *         (Livestreams haben keine feste Laufzeit)
     */
    public Duration parseDuration(String isoDuration) {
        if (isoDuration == null || isoDuration.isBlank()) {
            return null;
        }
        try {
            return Duration.parse(isoDuration);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Wandelt einen ISO-8601-Zeitstempel in einen {@link Instant}. */
    public Instant parseInstant(String isoInstant) {
        if (isoInstant == null || isoInstant.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(isoInstant);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private String thumbnailUrl(Snippet snippet) {
        return snippet.thumbnails() != null ? snippet.thumbnails().bestUrl() : null;
    }
}
