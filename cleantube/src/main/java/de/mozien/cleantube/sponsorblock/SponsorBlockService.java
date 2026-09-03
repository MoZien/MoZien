package de.mozien.cleantube.sponsorblock;

import de.mozien.cleantube.config.CacheConfig;
import de.mozien.cleantube.config.CleanTubeProperties;
import de.mozien.cleantube.sponsorblock.SponsorBlockResponses.RawSegment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Comparator;
import java.util.List;

/**
 * Bindet die SponsorBlock-Community-API an.
 *
 * <p><b>Wichtige Abgrenzung:</b> SponsorBlock hat nichts mit YouTubes Anzeigenauslieferung
 * zu tun. Die Datenbank kennzeichnet Abschnitte, die <i>Creator selbst</i> in ihr Video
 * geschnitten haben - bezahlte Sponsor-Lesungen, Eigenwerbung, Intros. CleanTube nutzt sie,
 * um im Player mit der offiziellen Methode {@code seekTo()} vorwaertszuspringen. Es wird
 * kein Anzeigen-Request blockiert, manipuliert oder umgangen.
 *
 * <p>Der Dienst ist bewusst "best effort": Faellt die Community-API aus, liefert diese
 * Klasse eine leere Liste statt einen Fehler. Das Video bleibt abspielbar - nur die
 * Sprungmarken fehlen.
 */
@Service
public class SponsorBlockService {

    private static final Logger log = LoggerFactory.getLogger(SponsorBlockService.class);

    private static final ParameterizedTypeReference<List<RawSegment>> SEGMENT_LIST =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient restClient;
    private final boolean enabled;
    private final List<String> categories;

    public SponsorBlockService(@Qualifier("sponsorBlockRestClientBuilder") RestClient.Builder builder,
                               CleanTubeProperties properties) {
        this.restClient = builder.build();
        this.enabled = properties.sponsorBlock().enabled();
        this.categories = properties.sponsorBlock().categories() != null
                ? List.copyOf(properties.sponsorBlock().categories())
                : List.of();
    }

    /** {@code true}, wenn das Feature eingeschaltet ist - das Frontend blendet den Schalter sonst aus. */
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Liefert die zu ueberspringenden Abschnitte eines Videos, aufsteigend nach Startzeit.
     *
     * @param videoId YouTube-Video-ID
     * @return moeglicherweise leere Liste; nie {@code null}
     */
    @Cacheable(cacheNames = CacheConfig.SKIP_SEGMENTS, key = "#videoId")
    public List<SkipSegment> segments(String videoId) {
        if (!enabled || categories.isEmpty()) {
            return List.of();
        }
        try {
            List<RawSegment> raw = restClient.get()
                    .uri(uri -> {
                        uri.path("/api/skipSegments").queryParam("videoID", videoId);
                        // Die API erwartet je Kategorie einen eigenen Parameter.
                        categories.forEach(category -> uri.queryParam("category", category));
                        return uri.build();
                    })
                    .accept(MediaType.APPLICATION_JSON)
                    // Bewusst exchange() statt retrieve(): Der Statuscode muss ausgewertet
                    // werden, BEVOR der Rumpf konvertiert wird. Liegt fuer ein Video nichts
                    // vor, antwortet SponsorBlock mit "404 Not Found" als text/plain - der
                    // Versuch, das als JSON-Liste zu lesen, wuerde scheitern.
                    .exchange((request, response) -> {
                        HttpStatusCode status = response.getStatusCode();
                        if (status.value() == HttpStatus.NOT_FOUND.value()) {
                            return List.<RawSegment>of();
                        }
                        if (status.isError()) {
                            throw new RestClientException("SponsorBlock antwortete mit " + status);
                        }
                        List<RawSegment> body = response.bodyTo(SEGMENT_LIST);
                        return body != null ? body : List.<RawSegment>of();
                    });

            if (raw == null) {
                return List.of();
            }
            return raw.stream()
                    .filter(RawSegment::isUsable)
                    .map(segment -> new SkipSegment(segment.category(),
                            segment.segment().get(0), segment.segment().get(1)))
                    .sorted(Comparator.comparingDouble(SkipSegment::startSeconds))
                    .toList();
        } catch (RestClientException e) {
            log.warn("SponsorBlock fuer Video {} nicht abrufbar: {}", videoId, e.getMessage());
            return List.of();
        }
    }
}
