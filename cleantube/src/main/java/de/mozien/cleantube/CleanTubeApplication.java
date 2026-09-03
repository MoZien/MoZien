package de.mozien.cleantube;

import de.mozien.cleantube.config.CleanTubeProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.EnableCaching;

/**
 * Einstiegspunkt von CleanTube.
 *
 * <p>CleanTube ist ein werbefreier, ablenkungsfreier YouTube-Client. Alle Aufrufe der
 * YouTube Data API v3 laufen ueber dieses Backend, damit der API-Key niemals im Browser
 * landet und das Tageskontingent (Quota) zentral ueberwacht werden kann.
 */
@SpringBootApplication
@EnableCaching
@EnableConfigurationProperties(CleanTubeProperties.class)
public class CleanTubeApplication {

    public static void main(String[] args) {
        SpringApplication.run(CleanTubeApplication.class, args);
    }
}
