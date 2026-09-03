package de.mozien.cleantube.youtube;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

/**
 * Abbild der JSON-Antworten der YouTube Data API v3.
 *
 * <p>Diese Typen bilden bewusst nur die Felder ab, die CleanTube tatsaechlich braucht;
 * alles Uebrige ignoriert Jackson. Sie bleiben im Paket {@code youtube} und verlassen
 * die Anwendung nie - nach aussen gehen ausschliesslich die Typen aus
 * {@code de.mozien.cleantube.model}. Damit ist das Frontend gegen Aenderungen der
 * Google-API abgeschirmt (Anti-Corruption Layer).
 */
public final class YouTubeResponses {

    private YouTubeResponses() {
    }

    /** Antwort von {@code videos.list}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record VideoListResponse(List<VideoItem> items, String nextPageToken) {
        public List<VideoItem> itemsOrEmpty() {
            return items != null ? items : List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record VideoItem(String id, Snippet snippet, ContentDetails contentDetails, Statistics statistics) {
    }

    /** Antwort von {@code search.list}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SearchListResponse(List<SearchItem> items, String nextPageToken) {
        public List<SearchItem> itemsOrEmpty() {
            return items != null ? items : List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SearchItem(SearchId id, Snippet snippet) {
    }

    /** Bei {@code search.list} ist die ID ein Objekt, dessen Feld vom Treffertyp abhaengt. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SearchId(String kind, String videoId, String channelId, String playlistId) {
    }

    /** Antwort von {@code channels.list}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChannelListResponse(List<ChannelItem> items) {
        public List<ChannelItem> itemsOrEmpty() {
            return items != null ? items : List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChannelItem(String id, Snippet snippet, ChannelStatistics statistics,
                              ChannelContentDetails contentDetails) {
    }

    /** Antwort von {@code playlistItems.list} - liefert die Uploads eines Kanals. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlaylistItemListResponse(List<PlaylistItem> items, String nextPageToken) {
        public List<PlaylistItem> itemsOrEmpty() {
            return items != null ? items : List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlaylistItem(Snippet snippet, PlaylistContentDetails contentDetails) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlaylistContentDetails(String videoId) {
    }

    /**
     * Gemeinsamer Metadatenblock aller Ressourcen.
     *
     * @param liveBroadcastContent {@code "live"} bei laufendem Stream, sonst {@code "none"}
     * @param resourceId           nur bei Playlist-Eintraegen befuellt
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Snippet(
            String publishedAt,
            String channelId,
            String title,
            String description,
            Thumbnails thumbnails,
            String channelTitle,
            String liveBroadcastContent,
            ResourceId resourceId) {

        public boolean isLive() {
            return "live".equals(liveBroadcastContent);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ResourceId(String kind, String videoId) {
    }

    /**
     * YouTube liefert je nach Video unterschiedlich viele Vorschaubild-Groessen.
     * {@code default} ist ein Java-Schluesselwort und wird deshalb umbenannt.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Thumbnails(
            @JsonProperty("default") Thumbnail defaultSize,
            Thumbnail medium,
            Thumbnail high,
            Thumbnail standard,
            Thumbnail maxres) {

        /** Liefert die hoechste vorhandene Aufloesung oder {@code null}, wenn es keine gibt. */
        public String bestUrl() {
            return Stream.of(maxres, standard, high, medium, defaultSize)
                    .filter(Objects::nonNull)
                    .map(Thumbnail::url)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(null);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Thumbnail(String url, Integer width, Integer height) {
    }

    /** {@code duration} kommt als ISO-8601-Dauer, z. B. {@code PT12M43S}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ContentDetails(String duration) {
    }

    /** Zaehler kommen als JSON-Strings; Jackson wandelt sie automatisch in {@code Long}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Statistics(Long viewCount, Long likeCount, Long commentCount) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChannelStatistics(Long subscriberCount, Long videoCount, Boolean hiddenSubscriberCount) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChannelContentDetails(RelatedPlaylists relatedPlaylists) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RelatedPlaylists(String uploads) {
    }

    /** Fehlerhuelle der Google-APIs, z. B. bei ungueltigem Key oder erschoepfter Quota. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErrorEnvelope(ApiError error) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiError(Integer code, String message, List<ErrorDetail> errors) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErrorDetail(String reason, String message) {
    }
}
