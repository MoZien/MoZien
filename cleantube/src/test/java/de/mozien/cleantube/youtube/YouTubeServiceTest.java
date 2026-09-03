package de.mozien.cleantube.youtube;

import de.mozien.cleantube.model.ChannelInfo;
import de.mozien.cleantube.model.VideoPage;
import de.mozien.cleantube.model.VideoSummary;
import de.mozien.cleantube.youtube.YouTubeResponses.ContentDetails;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistContentDetails;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistItem;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistItemListResponse;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchId;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchItem;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchListResponse;
import de.mozien.cleantube.youtube.YouTubeResponses.Snippet;
import de.mozien.cleantube.youtube.YouTubeResponses.Statistics;
import de.mozien.cleantube.youtube.YouTubeResponses.Thumbnail;
import de.mozien.cleantube.youtube.YouTubeResponses.Thumbnails;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoItem;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoListResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Prueft die fachliche Schicht: Anreicherung der Suchtreffer und der guenstige
 * Weg ueber die Uploads-Playlist.
 */
@ExtendWith(MockitoExtension.class)
class YouTubeServiceTest {

    @Mock
    private YouTubeClient client;

    @Mock
    private ChannelService channelService;

    @Spy
    private YouTubeMapper mapper = new YouTubeMapper();

    @InjectMocks
    private YouTubeService service;

    private static Snippet snippet(String title) {
        return new Snippet("2024-01-01T00:00:00Z", "UC1", title, "Text",
                new Thumbnails(new Thumbnail("http://bild", 120, 90), null, null, null, null),
                "Kanal", "none", null);
    }

    private static SearchItem searchItem(String videoId, String title) {
        return new SearchItem(new SearchId("youtube#video", videoId, null, null), snippet(title));
    }

    @Test
    @DisplayName("reichert Suchtreffer mit Laufzeit und Aufrufzahlen an")
    void reichert_suchtreffer_an() {
        when(client.search("kotlin", null)).thenReturn(new SearchListResponse(
                List.of(searchItem("aaaaaaaaaaa", "Erstes"), searchItem("bbbbbbbbbbb", "Zweites")), "TOKEN"));

        when(client.videosByIds(List.of("aaaaaaaaaaa", "bbbbbbbbbbb"))).thenReturn(new VideoListResponse(
                List.of(
                        new VideoItem("aaaaaaaaaaa", snippet("Erstes"), new ContentDetails("PT10M"),
                                new Statistics(1_000L, null, null)),
                        new VideoItem("bbbbbbbbbbb", snippet("Zweites"), new ContentDetails("PT2M30S"),
                                new Statistics(2_000L, null, null))),
                null));

        VideoPage page = service.search("kotlin", null);

        assertThat(page.items()).hasSize(2);
        assertThat(page.items().get(0).durationSeconds()).isEqualTo(600L);
        assertThat(page.items().get(0).viewCount()).isEqualTo(1_000L);
        assertThat(page.items().get(1).durationSeconds()).isEqualTo(150L);
        // Der Seiten-Cursor stammt aus der Suche, nicht aus der Anreicherung.
        assertThat(page.nextPageToken()).isEqualTo("TOKEN");
    }

    @Test
    @DisplayName("liefert Treffer auch dann, wenn die Anreicherung scheitert")
    void liefert_treffer_ohne_anreicherung() {
        when(client.search("kotlin", null)).thenReturn(new SearchListResponse(
                List.of(searchItem("aaaaaaaaaaa", "Erstes")), null));
        when(client.videosByIds(anyList())).thenThrow(new QuotaExceededException(10_000, 10_000));

        VideoPage page = service.search("kotlin", null);

        // Die teure Suche ist bereits bezahlt - eine Liste ohne Laufzeitangabe ist
        // deutlich besser als eine Fehlerseite.
        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().title()).isEqualTo("Erstes");
        assertThat(page.items().getFirst().durationSeconds()).isNull();
    }

    @Test
    @DisplayName("verwirft Suchtreffer, die keine Videos sind")
    void verwirft_nicht_video_treffer() {
        SearchItem kanalTreffer = new SearchItem(
                new SearchId("youtube#channel", null, "UC1", null), snippet("Ein Kanal"));
        when(client.search("kotlin", null))
                .thenReturn(new SearchListResponse(List.of(kanalTreffer), null));

        VideoPage page = service.search("kotlin", null);

        assertThat(page.items()).isEmpty();
        // Ohne Treffer entfaellt auch der Anreicherungsaufruf.
        verify(client, never()).videosByIds(anyList());
    }

    @Test
    @DisplayName("laedt Kanalvideos ueber die Uploads-Playlist statt ueber die teure Suche")
    void nutzt_uploads_playlist() {
        when(channelService.channel("UC1")).thenReturn(
                new ChannelInfo("UC1", "Kanal", null, null, 100L, 5L, "UU1"));
        when(client.playlistItems("UU1", null)).thenReturn(new PlaylistItemListResponse(
                List.of(new PlaylistItem(snippet("Upload"), new PlaylistContentDetails("aaaaaaaaaaa"))), null));
        when(client.videosByIds(List.of("aaaaaaaaaaa"))).thenReturn(new VideoListResponse(
                List.of(new VideoItem("aaaaaaaaaaa", snippet("Upload"), new ContentDetails("PT1M"),
                        new Statistics(50L, null, null))), null));

        VideoPage page = service.channelVideos("UC1", null);

        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().durationSeconds()).isEqualTo(60L);
        // Der entscheidende Punkt: keine Suche, also 100 Einheiten gespart.
        verify(client, never()).search(any(), any());
    }

    @Test
    @DisplayName("liefert eine leere Seite, wenn der Kanal keine Uploads-Playlist hat")
    void leere_seite_ohne_uploads_playlist() {
        when(channelService.channel("UC1")).thenReturn(
                new ChannelInfo("UC1", "Kanal", null, null, null, null, null));

        assertThat(service.channelVideos("UC1", null).items()).isEmpty();
        verify(client, never()).playlistItems(any(), any());
    }

    @Test
    @DisplayName("meldet ein nicht vorhandenes Video als ResourceNotFoundException")
    void meldet_unbekanntes_video() {
        when(client.videosByIds(List.of("aaaaaaaaaaa")))
                .thenReturn(new VideoListResponse(List.of(), null));

        assertThatThrownBy(() -> service.videoDetails("aaaaaaaaaaa"))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("aaaaaaaaaaa");
    }

    @Test
    @DisplayName("gibt die Trending-Liste unveraendert weiter")
    void mappt_trending() {
        when(client.mostPopular(eq(null))).thenReturn(new VideoListResponse(
                List.of(new VideoItem("aaaaaaaaaaa", snippet("Beliebt"), new ContentDetails("PT5M"),
                        new Statistics(9_000L, null, null))), "NEXT"));

        VideoPage page = service.trending(null);

        assertThat(page.items()).singleElement()
                .extracting(VideoSummary::title, VideoSummary::viewCount)
                .containsExactly("Beliebt", 9_000L);
        assertThat(page.nextPageToken()).isEqualTo("NEXT");
    }
}
