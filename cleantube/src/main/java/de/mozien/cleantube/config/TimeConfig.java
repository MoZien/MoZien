package de.mozien.cleantube.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Stellt die Uhr als Bean bereit.
 *
 * <p>Klassen, die von der Zeit abhaengen, greifen nie direkt auf
 * {@code LocalDate.now()} zu, sondern bekommen die Uhr injiziert. Nur so laesst
 * sich zum Beispiel der naechtliche Reset des YouTube-Kontingents im Test
 * ueberhaupt pruefen, ohne einen Tag zu warten.
 *
 * <p>Bewusst UTC: Google rechnet das Kontingent nach Pacific Time ab, aber ein
 * fester, sommerzeitfreier Bezugspunkt ist fuer den Zaehler wichtiger als der
 * exakt gleiche Umschaltzeitpunkt.
 */
@Configuration
public class TimeConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
