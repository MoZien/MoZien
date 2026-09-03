package de.mozien.cleantube;

import de.mozien.cleantube.config.CleanTubeProperties;

import java.time.Duration;
import java.util.List;

/** Gemeinsame Testdaten, damit die einzelnen Tests kurz und lesbar bleiben. */
public final class TestFixtures {

    public static final String YOUTUBE_BASE_URL = "http://youtube.test/youtube/v3";
    public static final String SPONSORBLOCK_BASE_URL = "http://sponsorblock.test";

    private TestFixtures() {
    }

    /** Konfiguration mit grosszuegigem Kontingent - fuer Tests, die nicht die Quota pruefen. */
    public static CleanTubeProperties properties() {
        return properties(10_000);
    }

    public static CleanTubeProperties properties(int dailyQuota) {
        return new CleanTubeProperties(
                new CleanTubeProperties.YouTube(
                        "test-key",
                        YOUTUBE_BASE_URL,
                        "DE",
                        5,
                        dailyQuota,
                        Duration.ofSeconds(2),
                        Duration.ofMinutes(1),
                        Duration.ofMinutes(1)),
                new CleanTubeProperties.SponsorBlock(
                        true,
                        SPONSORBLOCK_BASE_URL,
                        List.of("sponsor", "selfpromo"),
                        Duration.ofSeconds(2),
                        Duration.ofMinutes(1)));
    }
}
