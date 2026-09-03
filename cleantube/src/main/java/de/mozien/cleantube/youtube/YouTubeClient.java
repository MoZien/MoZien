package de.mozien.cleantube.youtube;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.mozien.cleantube.config.CleanTubeProperties;
import de.mozien.cleantube.youtube.YouTubeResponses.ChannelListResponse;
import de.mozien.cleantube.youtube.YouTubeResponses.ErrorEnvelope;
import de.mozien.cleantube.youtube.YouTubeResponses.PlaylistItemListResponse;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchListResponse;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoListResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Supplier;

/**
 * Technischer Zugriff auf die YouTube Data API v3.
 *
 * <p>Diese Klasse macht genau drei Dinge: Quota buchen, HTTP sprechen, Fehler uebersetzen.
 * Fachliche Logik (Mapping, Caching, Anreicherung) liegt bewusst eine Ebene hoeher im
 * {@link YouTubeService}.
 *
 * <p><b>Sicherheitsentscheidung:</b> Der API-Key wird ausschliesslich hier serverseitig
 * angehaengt. Er verlaesst das Backend nie in Richtung Browser - ein Key im Frontend
 * waere oeffentlich einsehbar und koennte von Dritten auf Kosten des Projekts
 * verbraucht werden.
 */
@Component
public class YouTubeClient {

    private static final Logger log = LoggerFactory.getLogger(YouTubeClient.class);

    /** YouTube akzeptiert hoechstens 50 Treffer pro Seite. */
    private static final int API_MAX_RESULTS = 50;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final QuotaGuard quotaGuard;
    private final String apiKey;
    private final String regionCode;
    private final int maxResults;

    public YouTubeClient(@Qualifier("youTubeRestClientBuilder") RestClient.Builder builder,
                         ObjectMapper objectMapper,
                         QuotaGuard quotaGuard,
                         CleanTubeProperties properties) {
        this.restClient = builder.build();
        this.objectMapper = objectMapper;
        this.quotaGuard = quotaGuard;
        this.apiKey = properties.youtube().apiKey();
        this.regionCode = properties.youtube().regionCode();
        this.maxResults = Math.min(properties.youtube().maxResults(), API_MAX_RESULTS);
    }

    /**
     * Laedt die aktuell beliebtesten Videos einer Region.
     *
     * <p>Kostet nur {@value QuotaGuard#COST_LIST} Quota-Einheit und ist damit die guenstige
     * Alternative zu einer Suche fuer die Startseite.
     */
    public VideoListResponse mostPopular(String pageToken) {
        quotaGuard.consume(QuotaGuard.COST_LIST);
        return execute("videos.list (mostPopular)", () -> restClient.get()
                .uri(uri -> {
                    uri.path("/videos")
                            .queryParam("part", "snippet,contentDetails,statistics")
                            .queryParam("chart", "mostPopular")
                            .queryParam("regionCode", regionCode)
                            .queryParam("maxResults", maxResults)
                            .queryParam("key", apiKey);
                    if (hasText(pageToken)) {
                        uri.queryParam("pageToken", pageToken);
                    }
                    return uri.build();
                })
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(VideoListResponse.class));
    }

    /**
     * Volltextsuche nach Videos.
     *
     * <p><b>Achtung, teuerster Aufruf der API:</b> {@value QuotaGuard#COST_SEARCH} Einheiten
     * pro Aufruf. Die Antwort enthaelt ausserdem weder Laufzeit noch Aufrufzahlen - diese
     * reichert der {@link YouTubeService} mit einem zweiten, guenstigen Aufruf nach.
     */
    public SearchListResponse search(String query, String pageToken) {
        quotaGuard.consume(QuotaGuard.COST_SEARCH);
        return execute("search.list", () -> restClient.get()
                .uri(uri -> {
                    uri.path("/search")
                            .queryParam("part", "snippet")
                            .queryParam("type", "video")
                            .queryParam("q", query)
                            .queryParam("maxResults", maxResults)
                            .queryParam("regionCode", regionCode)
                            .queryParam("safeSearch", "moderate")
                            .queryParam("key", apiKey);
                    if (hasText(pageToken)) {
                        uri.queryParam("pageToken", pageToken);
                    }
                    return uri.build();
                })
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(SearchListResponse.class));
    }

    /**
     * Laedt vollstaendige Daten zu bis zu 50 Video-IDs in <b>einem</b> Aufruf.
     *
     * <p>Der Sammelaufruf kostet genauso viel wie eine einzelne Abfrage - deshalb werden
     * IDs immer gebuendelt angefragt und nie einzeln in einer Schleife.
     */
    public VideoListResponse videosByIds(List<String> videoIds) {
        if (videoIds.isEmpty()) {
            return new VideoListResponse(List.of(), null);
        }
        if (videoIds.size() > API_MAX_RESULTS) {
            throw new IllegalArgumentException(
                    "Es duerfen hoechstens %d IDs pro Aufruf angefragt werden".formatted(API_MAX_RESULTS));
        }
        quotaGuard.consume(QuotaGuard.COST_LIST);
        String ids = String.join(",", videoIds);
        return execute("videos.list (byId)", () -> restClient.get()
                .uri(uri -> uri.path("/videos")
                        .queryParam("part", "snippet,contentDetails,statistics")
                        .queryParam("id", ids)
                        .queryParam("maxResults", API_MAX_RESULTS)
                        .queryParam("key", apiKey)
                        .build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(VideoListResponse.class));
    }

    /** Laedt Stammdaten eines Kanals inklusive der ID seiner "Uploads"-Playlist. */
    public ChannelListResponse channel(String channelId) {
        quotaGuard.consume(QuotaGuard.COST_LIST);
        return execute("channels.list", () -> restClient.get()
                .uri(uri -> uri.path("/channels")
                        .queryParam("part", "snippet,statistics,contentDetails")
                        .queryParam("id", channelId)
                        .queryParam("key", apiKey)
                        .build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(ChannelListResponse.class));
    }

    /**
     * Laedt Eintraege einer Playlist - hier die Uploads-Playlist eines Kanals.
     *
     * <p>Kostet 1 statt 100 Einheiten und ist damit der bevorzugte Weg, die Videos eines
     * Kanals zu laden (statt {@code search.list} mit {@code channelId}-Filter).
     */
    public PlaylistItemListResponse playlistItems(String playlistId, String pageToken) {
        quotaGuard.consume(QuotaGuard.COST_LIST);
        return execute("playlistItems.list", () -> restClient.get()
                .uri(uri -> {
                    uri.path("/playlistItems")
                            .queryParam("part", "snippet,contentDetails")
                            .queryParam("playlistId", playlistId)
                            .queryParam("maxResults", maxResults)
                            .queryParam("key", apiKey);
                    if (hasText(pageToken)) {
                        uri.queryParam("pageToken", pageToken);
                    }
                    return uri.build();
                })
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(PlaylistItemListResponse.class));
    }

    /**
     * Fuehrt einen Aufruf aus und uebersetzt Netzwerkfehler in eine fachliche Ausnahme.
     *
     * @param operation Name des API-Aufrufs fuer die Logausgabe
     */
    private <T> T execute(String operation, Supplier<T> call) {
        try {
            return call.get();
        } catch (ResourceAccessException e) {
            // Timeout oder DNS-/Verbindungsproblem - der API-Key darf dabei nie ins Log geraten.
            log.error("YouTube-Aufruf '{}' nicht erreichbar: {}", operation, e.getMessage());
            throw new YouTubeApiException("YouTube ist derzeit nicht erreichbar", e);
        }
    }

    /**
     * Uebersetzt eine Fehlerantwort von Google in eine Ausnahme dieser Anwendung.
     *
     * <p>Der Sonderfall {@code quotaExceeded} wird gesondert behandelt: Dann ist das
     * Kontingent serverseitig bei Google erschoepft, obwohl der lokale Zaehler noch
     * Luft sieht (z. B. weil ein zweites Deployment denselben Key nutzt).
     */
    private void translateError(org.springframework.http.HttpRequest request, ClientHttpResponse response)
            throws IOException {
        String body = StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
        HttpStatusCode status = response.getStatusCode();

        String reason = null;
        String message = null;
        try {
            ErrorEnvelope envelope = objectMapper.readValue(body, ErrorEnvelope.class);
            if (envelope.error() != null) {
                message = envelope.error().message();
                if (envelope.error().errors() != null && !envelope.error().errors().isEmpty()) {
                    reason = envelope.error().errors().getFirst().reason();
                }
            }
        } catch (Exception ignored) {
            // Keine JSON-Fehlerhuelle - wir bleiben beim reinen Statuscode.
        }

        log.warn("YouTube-API antwortete mit {} (reason={}, message={})", status, reason, message);

        if ("quotaExceeded".equals(reason) || "dailyLimitExceeded".equals(reason)) {
            throw new QuotaExceededException(quotaGuard.status().limit(), quotaGuard.status().limit());
        }
        throw new YouTubeApiException("YouTube-API-Fehler %s: %s"
                .formatted(status.value(), message != null ? message : "keine Details"));
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
