package de.mozien.cleantube.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

/**
 * Caching-Strategie von CleanTube.
 *
 * <p>Das Caching ist hier keine reine Performance-Optimierung, sondern eine fachliche
 * Notwendigkeit: Die YouTube Data API v3 erlaubt pro Projekt standardmaessig nur
 * 10.000 Quota-Einheiten am Tag. Ein einziger {@code search.list}-Aufruf kostet davon
 * bereits 100 Einheiten - ohne Cache waeren also nur rund 100 Suchen pro Tag moeglich.
 *
 * <p>Deshalb bekommt jeder Cache eine eigene Lebensdauer: teure Suchen werden laenger
 * vorgehalten als guenstige Detailabfragen.
 */
@Configuration
public class CacheConfig {

    /** Trending-Startseite (videos.list, 1 Einheit). */
    public static final String TRENDING = "trending";
    /** Suchergebnisse (search.list, 100 Einheiten). */
    public static final String SEARCH = "search";
    /** Video-Detailseite (videos.list, 1 Einheit). */
    public static final String VIDEO_DETAILS = "videoDetails";
    /** Kanal-Stammdaten (channels.list, 1 Einheit). */
    public static final String CHANNEL = "channel";
    /** Uploads eines Kanals (playlistItems.list, 1 Einheit). */
    public static final String CHANNEL_VIDEOS = "channelVideos";
    /** SponsorBlock-Segmente (externe API, kostet keine YouTube-Quota). */
    public static final String SKIP_SEGMENTS = "skipSegments";

    private final CleanTubeProperties properties;

    public CacheConfig(CleanTubeProperties properties) {
        this.properties = properties;
    }

    @Bean
    public CacheManager cacheManager() {
        Duration standard = properties.youtube().cacheTtl();
        Duration search = properties.youtube().searchCacheTtl();
        Duration sponsorBlock = properties.sponsorBlock().cacheTtl();

        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(List.of(
                cache(TRENDING, standard, 64),
                cache(SEARCH, search, 500),
                cache(VIDEO_DETAILS, standard, 1_000),
                cache(CHANNEL, standard, 500),
                cache(CHANNEL_VIDEOS, standard, 500),
                cache(SKIP_SEGMENTS, sponsorBlock, 2_000)));
        return manager;
    }

    private CaffeineCache cache(String name, Duration ttl, int maxSize) {
        return new CaffeineCache(name, Caffeine.newBuilder()
                .expireAfterWrite(ttl)
                .maximumSize(maxSize)
                .recordStats()
                .build());
    }
}
