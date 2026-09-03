package de.mozien.cleantube.youtube;

import de.mozien.cleantube.model.ChannelInfo;
import de.mozien.cleantube.model.VideoSummary;
import de.mozien.cleantube.youtube.YouTubeResponses.ChannelContentDetails;
import de.mozien.cleantube.youtube.YouTubeResponses.ChannelItem;
import de.mozien.cleantube.youtube.YouTubeResponses.ChannelStatistics;
import de.mozien.cleantube.youtube.YouTubeResponses.ContentDetails;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistContentDetails;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistItem;
import de.mozien.cleantube.youtube.YouTubeResponses.RelatedPlaylists;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchId;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchItem;
import de.mozien.cleantube.youtube.YouTubeResponses.Snippet;
import de.mozien.cleantube.youtube.YouTubeResponses.Statistics;
import de.mozien.cleantube.youtube.YouTubeResponses.Thumbnail;
import de.mozien.cleantube.youtube.YouTubeResponses.Thumbnails;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoItem;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Prueft die Uebersetzung der Google-Antworten in das Domaenenmodell.
 *
 * <p>Schwerpunkt sind die Sonderfaelle: YouTube liefert je nach Video unterschiedlich
 * viele Felder, und ein fehlendes Feld darf nie zu einer Ausnahme fuehren.
 */
class YouTubeMapperTest {

    private final YouTubeMapper mapper = new YouTubeMapper();

    private static Thumbnails thumbnails(String defaultUrl, String maxresUrl) {
        return new Thumbnails(
                defaultUrl != null ? new Thumbnail(defaultUrl, 120, 90) : null,
                null, null, null,
                maxresUrl != null ? new Thumbnail(maxresUrl, 1280, 720) : null);
    }

    @Test
    @DisplayName("uebernimmt alle Felder eines vollstaendigen Videos")
    void mappt_vollstaendiges_video() {
        VideoItem item = new VideoItem(
                "dQw4w9WgXcQ",
                new Snippet("2009-10-25T06:57:33Z", "UC38IQsAvIsxxjztdMZQtwHA", "Titel", "Beschreibung",
                        thumbnails("http://klein", "http://gross"), "Kanalname", "none", null),
                new ContentDetails("PT3M33S"),
                new Statistics(1_500_000L, 42L, 7L));

        VideoSummary summary = mapper.toSummary(item);

        assertThat(summary.id()).isEqualTo("dQw4w9WgXcQ");
        assertThat(summary.title()).isEqualTo("Titel");
        assertThat(summary.channelTitle()).isEqualTo("Kanalname");
        assertThat(summary.durationSeconds()).isEqualTo(213L);
        assertThat(summary.viewCount()).isEqualTo(1_500_000L);
        assertThat(summary.publishedAt()).isEqualTo(Instant.parse("2009-10-25T06:57:33Z"));
        assertThat(summary.live()).isFalse();
    }

    @Test
    @DisplayName("waehlt immer das hoechstaufgeloeste Vorschaubild")
    void waehlt_bestes_vorschaubild() {
        VideoItem item = new VideoItem("id-1", new Snippet(null, null, "T", null,
                thumbnails("http://klein", "http://gross"), null, "none", null), null, null);

        assertThat(mapper.toSummary(item).thumbnailUrl()).isEqualTo("http://gross");
    }

    @Test
    @DisplayName("faellt auf eine kleinere Aufloesung zurueck, wenn die grosse fehlt")
    void faellt_auf_kleineres_bild_zurueck() {
        VideoItem item = new VideoItem("id-1", new Snippet(null, null, "T", null,
                thumbnails("http://klein", null), null, "none", null), null, null);

        assertThat(mapper.toSummary(item).thumbnailUrl()).isEqualTo("http://klein");
    }

    @Test
    @DisplayName("kommt ohne contentDetails und statistics aus")
    void vertraegt_fehlende_bloecke() {
        VideoItem item = new VideoItem("id-1",
                new Snippet(null, null, "Nur ein Titel", null, null, null, "none", null), null, null);

        VideoSummary summary = mapper.toSummary(item);

        assertThat(summary.durationSeconds()).isNull();
        assertThat(summary.viewCount()).isNull();
        assertThat(summary.thumbnailUrl()).isNull();
        assertThat(summary.publishedAt()).isNull();
    }

    @Test
    @DisplayName("erkennt einen laufenden Livestream")
    void erkennt_livestream() {
        VideoItem item = new VideoItem("id-1",
                new Snippet(null, null, "Stream", null, null, null, "live", null), null, null);

        assertThat(mapper.toSummary(item).live()).isTrue();
    }

    @Test
    @DisplayName("liefert null statt einer Ausnahme, wenn der Snippet-Block fehlt")
    void liefert_null_ohne_snippet() {
        assertThat(mapper.toSummary(new VideoItem("id-1", null, null, null))).isNull();
    }

    @Test
    @DisplayName("liest Suchtreffer aus dem verschachtelten id-Objekt")
    void mappt_suchtreffer() {
        SearchItem item = new SearchItem(
                new SearchId("youtube#video", "abcdefghijk", null, null),
                new Snippet("2024-01-01T00:00:00Z", "UC1", "Treffer", null,
                        thumbnails("http://bild", null), "Kanal", "none", null));

        VideoSummary summary = mapper.toSummary(item);

        assertThat(summary.id()).isEqualTo("abcdefghijk");
        // Die Suche liefert diese Werte prinzipbedingt nicht mit.
        assertThat(summary.durationSeconds()).isNull();
        assertThat(summary.viewCount()).isNull();
    }

    @Test
    @DisplayName("verwirft Suchtreffer ohne Video-ID (Kanal- oder Playlist-Treffer)")
    void verwirft_suchtreffer_ohne_videoid() {
        SearchItem item = new SearchItem(
                new SearchId("youtube#channel", null, "UC1", null),
                new Snippet(null, "UC1", "Kanal", null, thumbnails("http://bild", null), "Kanal", "none", null));

        assertThat(mapper.toSummary(item)).isNull();
    }

    @Test
    @DisplayName("verwirft geloeschte Playlist-Eintraege")
    void verwirft_geloeschte_playlist_eintraege() {
        // Geloeschte Videos bleiben als Platzhalter ohne Vorschaubild in der Playlist stehen.
        PlaylistItem geloescht = new PlaylistItem(
                new Snippet(null, "UC1", "Deleted video", null, null, "Kanal", "none", null),
                new PlaylistContentDetails("abcdefghijk"));

        assertThat(mapper.toSummary(geloescht)).isNull();
    }

    @Test
    @DisplayName("liest die Video-ID von Playlist-Eintraegen aus contentDetails")
    void mappt_playlist_eintrag() {
        PlaylistItem item = new PlaylistItem(
                new Snippet("2024-05-05T12:00:00Z", "UC1", "Upload", null,
                        thumbnails("http://bild", null), "Kanal", "none", null),
                new PlaylistContentDetails("abcdefghijk"));

        assertThat(mapper.toSummary(item).id()).isEqualTo("abcdefghijk");
    }

    @Test
    @DisplayName("verbirgt die Abonnentenzahl, wenn der Kanal es so eingestellt hat")
    void verbirgt_abonnenten() {
        ChannelItem item = new ChannelItem("UC1",
                new Snippet(null, null, "Kanal", "Ueber uns", thumbnails("http://bild", null), null, "none", null),
                new ChannelStatistics(1234L, 56L, true),
                new ChannelContentDetails(new RelatedPlaylists("UU1")));

        ChannelInfo info = mapper.toChannelInfo(item);

        assertThat(info.subscriberCount()).isNull();
        assertThat(info.videoCount()).isEqualTo(56L);
        assertThat(info.uploadsPlaylist()).isEqualTo("UU1");
    }

    @Test
    @DisplayName("rechnet die Laufzeit fuer den API-Vertrag in Sekunden um")
    void rechnet_laufzeit_in_sekunden() {
        VideoItem item = new VideoItem("id-1", snippetOhneBild(), new ContentDetails("PT1H2M3S"), null);

        assertThat(mapper.durationSeconds(item)).isEqualTo(3723L);
        assertThat(mapper.durationSeconds(new VideoItem("id-1", snippetOhneBild(), null, null))).isNull();
        assertThat(mapper.durationSeconds(
                new VideoItem("id-1", snippetOhneBild(), new ContentDetails("kaputt"), null))).isNull();
    }

    private static Snippet snippetOhneBild() {
        return new Snippet(null, null, "T", null, null, null, "none", null);
    }

    @Test
    @DisplayName("liest ISO-8601-Dauern inklusive mehrstuendiger Videos")
    void liest_dauern() {
        assertThat(mapper.parseDuration("PT3M33S")).isEqualTo(Duration.ofSeconds(213));
        assertThat(mapper.parseDuration("PT1H2M3S")).isEqualTo(Duration.ofSeconds(3723));
        assertThat(mapper.parseDuration("P0D")).isEqualTo(Duration.ZERO);
        assertThat(mapper.parseDuration("kaputt")).isNull();
        assertThat(mapper.parseDuration(null)).isNull();
    }
}
