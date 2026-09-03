package de.mozien.cleantube.youtube;

import de.mozien.cleantube.config.CacheConfig;
import de.mozien.cleantube.model.ChannelInfo;
import de.mozien.cleantube.model.VideoDetails;
import de.mozien.cleantube.model.VideoPage;
import de.mozien.cleantube.model.VideoSummary;
import de.mozien.cleantube.youtube.YouTubeResponses.SearchListResponse;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoItem;
import de.mozien.cleantube.youtube.YouTubeResponses.VideoListResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Fachliche Schicht ueber der YouTube Data API v3.
 *
 * <p>Hier liegen die drei Dinge, die diese Anwendung von einem blossen API-Durchreicher
 * unterscheiden:
 *
 * <ol>
 *   <li><b>Caching</b> - jede oeffentliche Methode ist zwischengespeichert, weil das
 *       Tageskontingent sonst binnen Minuten aufgebraucht waere.</li>
 *   <li><b>Anreicherung</b> - {@code search.list} liefert weder Laufzeit noch Aufrufzahlen;
 *       beides wird mit einem einzigen zusaetzlichen Aufruf fuer alle Treffer nachgeladen.</li>
 *   <li><b>Guenstige Alternativen</b> - die Videos eines Kanals kommen ueber dessen
 *       Uploads-Playlist (1 Einheit) statt ueber eine gefilterte Suche (100 Einheiten).</li>
 * </ol>
 */
@Service
public class YouTubeService {

    private static final Logger log = LoggerFactory.getLogger(YouTubeService.class);

    private final YouTubeClient client;
    private final ChannelService channelService;
    private final YouTubeMapper mapper;

    public YouTubeService(YouTubeClient client, ChannelService channelService, YouTubeMapper mapper) {
        this.client = client;
        this.channelService = channelService;
        this.mapper = mapper;
    }

    /**
     * Startseite: aktuell beliebte Videos der konfigurierten Region.
     *
     * <p>Bewusst <i>kein</i> personalisierter Empfehlungs-Feed - genau der erzeugt den
     * Sog, den diese Anwendung vermeiden will.
     *
     * @param pageToken Cursor der Folgeseite, {@code null} fuer die erste Seite
     */
    @Cacheable(cacheNames = CacheConfig.TRENDING, key = "#pageToken == null ? 'first' : #pageToken")
    public VideoPage trending(String pageToken) {
        VideoListResponse response = client.mostPopular(pageToken);
        List<VideoSummary> items = response.itemsOrEmpty().stream()
                .map(mapper::toSummary)
                .filter(Objects::nonNull)
                .toList();
        return new VideoPage(items, response.nextPageToken());
    }

    /**
     * Volltextsuche mit nachgeladenen Laufzeiten und Aufrufzahlen.
     *
     * <p>Kosten: 100 Einheiten fuer die Suche plus 1 Einheit fuer die Anreicherung.
     * Der Cache-Schluessel wird kleingeschrieben, damit "Spring Boot" und "spring boot"
     * nicht zwei Kontingente verbrauchen.
     *
     * @param query     Suchbegriff
     * @param pageToken Cursor der Folgeseite, {@code null} fuer die erste Seite
     */
    @Cacheable(cacheNames = CacheConfig.SEARCH,
            key = "#query.trim().toLowerCase() + '|' + (#pageToken == null ? '' : #pageToken)")
    public VideoPage search(String query, String pageToken) {
        SearchListResponse response = client.search(query, pageToken);
        List<VideoSummary> items = response.itemsOrEmpty().stream()
                .map(mapper::toSummary)
                .filter(Objects::nonNull)
                .toList();
        return new VideoPage(enrich(items), response.nextPageToken());
    }

    /**
     * Alle Daten der Wiedergabeseite.
     *
     * @throws ResourceNotFoundException wenn das Video nicht existiert oder nicht oeffentlich ist
     */
    @Cacheable(cacheNames = CacheConfig.VIDEO_DETAILS, key = "#videoId")
    public VideoDetails videoDetails(String videoId) {
        VideoItem item = client.videosByIds(List.of(videoId)).itemsOrEmpty().stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Video %s nicht gefunden".formatted(videoId)));
        VideoDetails details = mapper.toDetails(item);
        if (details == null) {
            throw new ResourceNotFoundException("Video %s liefert keine Daten".formatted(videoId));
        }
        return details;
    }

    /** Stammdaten eines Kanals. */
    public ChannelInfo channel(String channelId) {
        return channelService.channel(channelId);
    }

    /**
     * Videos eines Kanals, chronologisch absteigend.
     *
     * <p>Weg ueber die Uploads-Playlist: 1 Einheit fuer die Kanaldaten (meist aus dem Cache)
     * plus 1 Einheit fuer die Playlist plus 1 Einheit fuer die Anreicherung - zusammen
     * hoechstens 3 statt 100 Einheiten.
     *
     * @param channelId YouTube-Kanal-ID
     * @param pageToken Cursor der Folgeseite, {@code null} fuer die erste Seite
     */
    @Cacheable(cacheNames = CacheConfig.CHANNEL_VIDEOS,
            key = "#channelId + '|' + (#pageToken == null ? '' : #pageToken)")
    public VideoPage channelVideos(String channelId, String pageToken) {
        ChannelInfo channel = channelService.channel(channelId);
        if (channel.uploadsPlaylist() == null) {
            log.info("Kanal {} hat keine Uploads-Playlist", channelId);
            return VideoPage.empty();
        }
        var response = client.playlistItems(channel.uploadsPlaylist(), pageToken);
        List<VideoSummary> items = response.itemsOrEmpty().stream()
                .map(mapper::toSummary)
                .filter(Objects::nonNull)
                .toList();
        return new VideoPage(enrich(items), response.nextPageToken());
    }

    /**
     * Ergaenzt Laufzeit, Aufrufzahlen und Live-Status fuer eine Trefferliste.
     *
     * <p>Ein einziger Sammelauffruf fuer bis zu 50 Videos - eine Schleife mit einem Aufruf
     * je Video wuerde dasselbe Ergebnis fuer das 50-Fache an Quota liefern.
     *
     * <p>Schlaegt die Anreicherung fehl (Quota erschoepft, API gestoert), werden die
     * Treffer unangereichert zurueckgegeben: eine Liste ohne Laufzeitangabe ist deutlich
     * besser als eine Fehlerseite, obwohl die teure Suche bereits bezahlt wurde.
     */
    private List<VideoSummary> enrich(List<VideoSummary> items) {
        if (items.isEmpty()) {
            return items;
        }
        List<String> ids = items.stream().map(VideoSummary::id).toList();
        try {
            Map<String, VideoItem> byId = client.videosByIds(ids).itemsOrEmpty().stream()
                    .filter(item -> item.id() != null)
                    .collect(Collectors.toMap(VideoItem::id, Function.identity(), (a, b) -> a));

            return items.stream()
                    .map(summary -> {
                        VideoItem item = byId.get(summary.id());
                        if (item == null) {
                            return summary;
                        }
                        return summary.withDetails(
                                mapper.durationSeconds(item),
                                item.statistics() != null ? item.statistics().viewCount() : null,
                                item.snippet() != null && item.snippet().isLive());
                    })
                    .toList();
        } catch (QuotaExceededException | YouTubeApiException e) {
            log.warn("Anreicherung uebersprungen, Treffer werden ohne Laufzeit geliefert: {}", e.getMessage());
            return items;
        }
    }
}
