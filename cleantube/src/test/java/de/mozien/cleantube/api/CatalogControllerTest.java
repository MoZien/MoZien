package de.mozien.cleantube.api;

import de.mozien.cleantube.model.VideoDetails;
import de.mozien.cleantube.model.VideoPage;
import de.mozien.cleantube.model.VideoSummary;
import de.mozien.cleantube.youtube.QuotaExceededException;
import de.mozien.cleantube.youtube.ResourceNotFoundException;
import de.mozien.cleantube.youtube.YouTubeApiException;
import de.mozien.cleantube.youtube.YouTubeService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Prueft die HTTP-Schnittstelle: Antwortformat, Eingabepruefung und die
 * Uebersetzung fachlicher Ausnahmen in passende Statuscodes.
 */
@WebMvcTest(CatalogController.class)
class CatalogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private YouTubeService youTubeService;

    private static VideoSummary summary() {
        return new VideoSummary("dQw4w9WgXcQ", "Ein Video", "UC1", "Ein Kanal",
                "http://bild", Instant.parse("2024-01-01T00:00:00Z"), 213L, 1_500_000L, false);
    }

    @Test
    @DisplayName("liefert die Trending-Liste als JSON")
    void liefert_trending() throws Exception {
        when(youTubeService.trending(null)).thenReturn(new VideoPage(List.of(summary()), "NEXT"));

        mockMvc.perform(get("/api/videos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value("dQw4w9WgXcQ"))
                .andExpect(jsonPath("$.items[0].title").value("Ein Video"))
                // Laufzeit als schlichte Sekundenzahl - der im DTO festgelegte Vertrag.
                .andExpect(jsonPath("$.items[0].durationSeconds").value(213))
                .andExpect(jsonPath("$.items[0].publishedAt").value("2024-01-01T00:00:00Z"))
                .andExpect(jsonPath("$.nextPageToken").value("NEXT"));
    }

    @Test
    @DisplayName("reicht den Seiten-Cursor an den Service durch")
    void reicht_pagetoken_durch() throws Exception {
        when(youTubeService.trending("CAUQAA")).thenReturn(VideoPage.empty());

        mockMvc.perform(get("/api/videos").param("pageToken", "CAUQAA"))
                .andExpect(status().isOk());

        verify(youTubeService).trending("CAUQAA");
    }

    @Test
    @DisplayName("liefert die Daten der Wiedergabeseite")
    void liefert_videodetails() throws Exception {
        when(youTubeService.videoDetails("dQw4w9WgXcQ")).thenReturn(new VideoDetails(
                "dQw4w9WgXcQ", "Ein Video", "Beschreibung", "UC1", "Ein Kanal",
                Instant.parse("2024-01-01T00:00:00Z"), 213L, 1_500_000L, 4_200L, false));

        mockMvc.perform(get("/api/videos/dQw4w9WgXcQ"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value("Beschreibung"))
                .andExpect(jsonPath("$.likeCount").value(4200));
    }

    @Test
    @DisplayName("antwortet auf ein unbekanntes Video mit 404")
    void antwortet_mit_404() throws Exception {
        when(youTubeService.videoDetails("aaaaaaaaaaa"))
                .thenThrow(new ResourceNotFoundException("Video aaaaaaaaaaa nicht gefunden"));

        mockMvc.perform(get("/api/videos/aaaaaaaaaaa"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    @DisplayName("antwortet bei erschoepftem Kontingent mit 429 und einer Erklaerung")
    void antwortet_mit_429() throws Exception {
        when(youTubeService.search("kotlin", null))
                .thenThrow(new QuotaExceededException(10_000, 10_000));

        mockMvc.perform(get("/api/search").param("q", "kotlin"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("quota_exceeded"))
                // Der Nutzer soll erfahren, warum es klemmt und wann es wieder geht.
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("Mitternacht")));
    }

    @Test
    @DisplayName("antwortet bei einer Stoerung der YouTube-API mit 502")
    void antwortet_mit_502() throws Exception {
        when(youTubeService.trending(null)).thenThrow(new YouTubeApiException("kaputt"));

        mockMvc.perform(get("/api/videos"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error").value("upstream_error"));
    }

    @Test
    @DisplayName("weist eine Video-ID im falschen Format ab, ohne Quota zu verbrauchen")
    void weist_ungueltige_videoid_ab() throws Exception {
        mockMvc.perform(get("/api/videos/zu-kurz"))
                .andExpect(status().isBadRequest());

        // Entscheidend: Die Anfrage erreicht die Google-API gar nicht erst.
        verify(youTubeService, never()).videoDetails(any());
    }

    @Test
    @DisplayName("weist eine Suche ohne Suchbegriff ab")
    void weist_suche_ohne_begriff_ab() throws Exception {
        mockMvc.perform(get("/api/search"))
                .andExpect(status().isBadRequest());

        verify(youTubeService, never()).search(any(), any());
    }

    @Test
    @DisplayName("weist einen ueberlangen Suchbegriff ab")
    void weist_ueberlangen_begriff_ab() throws Exception {
        mockMvc.perform(get("/api/search").param("q", "x".repeat(101)))
                .andExpect(status().isBadRequest());

        verify(youTubeService, never()).search(any(), any());
    }

    @Test
    @DisplayName("liefert die Videos eines Kanals")
    void liefert_kanalvideos() throws Exception {
        when(youTubeService.channelVideos("UC38IQsAvIsxxjztdMZQtwHA", null))
                .thenReturn(new VideoPage(List.of(summary()), null));

        mockMvc.perform(get("/api/channels/UC38IQsAvIsxxjztdMZQtwHA/videos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].channelTitle").value("Ein Kanal"))
                .andExpect(jsonPath("$.nextPageToken").doesNotExist());
    }
}
