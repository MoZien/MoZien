package de.mozien.cleantube.youtube;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.mozien.cleantube.TestFixtures;
import de.mozien.cleantube.config.CleanTubeProperties;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoListResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Clock;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Prueft die HTTP-Schicht gegen eine Attrappe der Google-API.
 *
 * <p>Getestet wird beides: dass die richtigen Parameter hinausgehen (inklusive der
 * Quota-Buchung) und dass die Antwort korrekt gelesen wird. Ein echter Netzwerkaufruf
 * findet nicht statt - die Tests laufen offline und verbrauchen kein Kontingent.
 */
class YouTubeClientTest {

    private static final String BASE = TestFixtures.YOUTUBE_BASE_URL;

    private static final String VIDEO_JSON = """
            {
              "items": [
                {
                  "id": "dQw4w9WgXcQ",
                  "snippet": {
                    "publishedAt": "2009-10-25T06:57:33Z",
                    "channelId": "UC38IQsAvIsxxjztdMZQtwHA",
                    "title": "Ein Video",
                    "description": "Text",
                    "channelTitle": "Ein Kanal",
                    "liveBroadcastContent": "none",
                    "thumbnails": {
                      "default": { "url": "http://klein", "width": 120, "height": 90 },
                      "maxres":  { "url": "http://gross", "width": 1280, "height": 720 }
                    }
                  },
                  "contentDetails": { "duration": "PT3M33S" },
                  "statistics": { "viewCount": "1500000", "likeCount": "4200" }
                }
              ],
              "nextPageToken": "CAUQAA"
            }
            """;

    private MockRestServiceServer server;
    private YouTubeClient client;
    private QuotaGuard quotaGuard;

    @BeforeEach
    void setUp() {
        setUpWithQuota(10_000);
    }

    private void setUpWithQuota(int dailyQuota) {
        CleanTubeProperties properties = TestFixtures.properties(dailyQuota);
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE);
        server = MockRestServiceServer.bindTo(builder).build();
        quotaGuard = new QuotaGuard(properties, Clock.systemUTC());
        client = new YouTubeClient(builder, new ObjectMapper(), quotaGuard, properties);
    }

    @Test
    @DisplayName("laedt die Trending-Liste und liest alle Felder aus")
    void laedt_trending() {
        server.expect(requestTo(startsWith(BASE + "/videos?")))
                .andExpect(queryParam("chart", "mostPopular"))
                .andExpect(queryParam("regionCode", "DE"))
                .andExpect(queryParam("part", "snippet,contentDetails,statistics"))
                .andExpect(queryParam("key", "test-key"))
                .andRespond(withSuccess(VIDEO_JSON, MediaType.APPLICATION_JSON));

        VideoListResponse response = client.mostPopular(null);

        assertThat(response.itemsOrEmpty()).hasSize(1);
        assertThat(response.itemsOrEmpty().getFirst().snippet().title()).isEqualTo("Ein Video");
        assertThat(response.itemsOrEmpty().getFirst().statistics().viewCount()).isEqualTo(1_500_000L);
        assertThat(response.itemsOrEmpty().getFirst().snippet().thumbnails().bestUrl()).isEqualTo("http://gross");
        assertThat(response.nextPageToken()).isEqualTo("CAUQAA");
        server.verify();
    }

    @Test
    @DisplayName("haengt den Seiten-Cursor nur an, wenn einer vorliegt")
    void haengt_pagetoken_an() {
        server.expect(requestTo(startsWith(BASE + "/videos?")))
                .andExpect(queryParam("pageToken", "CAUQAA"))
                .andRespond(withSuccess(VIDEO_JSON, MediaType.APPLICATION_JSON));

        client.mostPopular("CAUQAA");
        server.verify();
    }

    @Test
    @DisplayName("bucht fuer eine Suche 100 Quota-Einheiten")
    void bucht_suche_mit_100_einheiten() {
        server.expect(requestTo(startsWith(BASE + "/search?")))
                .andExpect(queryParam("type", "video"))
                .andExpect(queryParam("q", "kotlin"))
                .andRespond(withSuccess("{\"items\":[]}", MediaType.APPLICATION_JSON));

        client.search("kotlin", null);

        assertThat(quotaGuard.status().used()).isEqualTo(QuotaGuard.COST_SEARCH);
        server.verify();
    }

    @Test
    @DisplayName("bucht fuer eine Listenabfrage nur eine Quota-Einheit")
    void bucht_liste_mit_einer_einheit() {
        server.expect(requestTo(startsWith(BASE + "/videos?")))
                .andRespond(withSuccess(VIDEO_JSON, MediaType.APPLICATION_JSON));

        client.mostPopular(null);

        assertThat(quotaGuard.status().used()).isEqualTo(QuotaGuard.COST_LIST);
    }

    @Test
    @DisplayName("kodiert Suchbegriffe mit Leer- und Sonderzeichen korrekt")
    void kodiert_suchbegriff() {
        // Ohne korrekte Prozentkodierung wuerde die URL beim Leerzeichen abbrechen.
        server.expect(requestTo(containsString("q=spring%20boot%20%26%20jpa")))
                .andRespond(withSuccess("{\"items\":[]}", MediaType.APPLICATION_JSON));

        client.search("spring boot & jpa", null);
        server.verify();
    }

    @Test
    @DisplayName("fragt mehrere IDs in einem einzigen Aufruf ab")
    void buendelt_ids_in_einem_aufruf() {
        server.expect(requestTo(startsWith(BASE + "/videos?")))
                .andExpect(queryParam("id", "aaaaaaaaaaa,bbbbbbbbbbb,ccccccccccc"))
                .andRespond(withSuccess(VIDEO_JSON, MediaType.APPLICATION_JSON));

        client.videosByIds(List.of("aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"));

        // Entscheidend fuer die Quota: 3 Videos, aber nur 1 Einheit.
        assertThat(quotaGuard.status().used()).isEqualTo(QuotaGuard.COST_LIST);
        server.verify();
    }

    @Test
    @DisplayName("verzichtet bei leerer ID-Liste auf Aufruf und Quota")
    void ruft_bei_leerer_liste_nicht_auf() {
        VideoListResponse response = client.videosByIds(List.of());

        assertThat(response.itemsOrEmpty()).isEmpty();
        assertThat(quotaGuard.status().used()).isZero();
        server.verify();
    }

    @Test
    @DisplayName("uebersetzt die Fehlermeldung 'quotaExceeded' von Google")
    void uebersetzt_quota_fehler() {
        server.expect(requestTo(startsWith(BASE + "/search?")))
                .andRespond(withStatus(HttpStatus.FORBIDDEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"error":{"code":403,"message":"quota exceeded",
                                 "errors":[{"reason":"quotaExceeded","message":"quota exceeded"}]}}
                                """));

        assertThatThrownBy(() -> client.search("test", null))
                .isInstanceOf(QuotaExceededException.class);
    }

    @Test
    @DisplayName("uebersetzt sonstige API-Fehler in eine YouTubeApiException")
    void uebersetzt_sonstige_fehler() {
        server.expect(requestTo(startsWith(BASE + "/videos?")))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"error":{"code":400,"message":"API key not valid",
                                 "errors":[{"reason":"badRequest","message":"API key not valid"}]}}
                                """));

        assertThatThrownBy(() -> client.mostPopular(null))
                .isInstanceOf(YouTubeApiException.class)
                .hasMessageContaining("API key not valid");
    }

    @Test
    @DisplayName("lehnt den Aufruf ab, bevor Quota bei Google verbraucht wird")
    void lehnt_vor_dem_aufruf_ab() {
        setUpWithQuota(50); // reicht nicht fuer eine Suche (100 Einheiten)

        assertThatThrownBy(() -> client.search("test", null))
                .isInstanceOf(QuotaExceededException.class);

        // Kein einziger HTTP-Aufruf - genau das ist der Sinn der Bremse.
        server.verify();
        assertThat(quotaGuard.status().used()).isZero();
    }

    @Test
    @DisplayName("weist mehr als 50 IDs pro Aufruf zurueck")
    void weist_zu_viele_ids_zurueck() {
        List<String> zuViele = java.util.stream.IntStream.range(0, 51)
                .mapToObj(i -> "id%09d".formatted(i))
                .toList();

        assertThatThrownBy(() -> client.videosByIds(zuViele))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(quotaGuard.status().used()).isZero();
    }
}
