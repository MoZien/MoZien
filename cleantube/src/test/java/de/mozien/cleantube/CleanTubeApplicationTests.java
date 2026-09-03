package de.mozien.cleantube;

import de.mozien.cleantube.api.CatalogController;
import de.mozien.cleantube.config.CleanTubeProperties;
import de.mozien.cleantube.sponsorblock.SponsorBlockService;
import de.mozien.cleantube.youtube.YouTubeService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Rauchtest: Der Spring-Kontext muss vollstaendig hochfahren.
 *
 * <p>Faengt Verdrahtungsfehler ab, die den einzelnen Unit-Tests entgehen - etwa zwei
 * gleichnamige Beans oder eine nicht aufloesbare Konfiguration. Es werden dabei keine
 * echten Netzwerkaufrufe ausgeloest.
 */
@SpringBootTest
class CleanTubeApplicationTests {

    @Autowired
    private CatalogController catalogController;

    @Autowired
    private YouTubeService youTubeService;

    @Autowired
    private SponsorBlockService sponsorBlockService;

    @Autowired
    private CacheManager cacheManager;

    @Autowired
    private CleanTubeProperties properties;

    @Test
    @DisplayName("startet den Anwendungskontext mit allen Beans")
    void kontext_startet() {
        assertThat(catalogController).isNotNull();
        assertThat(youTubeService).isNotNull();
        assertThat(sponsorBlockService).isNotNull();
    }

    @Test
    @DisplayName("legt alle konfigurierten Caches an")
    void caches_sind_angelegt() {
        // Ohne diese Caches waere das Tageskontingent binnen Minuten aufgebraucht.
        assertThat(cacheManager.getCacheNames())
                .containsExactlyInAnyOrder("trending", "search", "videoDetails",
                        "channel", "channelVideos", "skipSegments");
    }

    @Test
    @DisplayName("liest die Konfiguration typsicher ein")
    void konfiguration_ist_gebunden() {
        assertThat(properties.youtube().apiKey()).isEqualTo("test-key");
        assertThat(properties.youtube().regionCode()).isEqualTo("DE");
        assertThat(properties.sponsorBlock().categories()).contains("sponsor");
    }
}
