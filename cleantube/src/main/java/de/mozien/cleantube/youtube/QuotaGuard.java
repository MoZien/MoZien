package de.mozien.cleantube.youtube;

import de.mozien.cleantube.config.CleanTubeProperties;
import de.mozien.cleantube.model.QuotaStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

/**
 * Buchhaltung ueber das Tageskontingent der YouTube Data API v3.
 *
 * <p>Google rechnet jeden API-Aufruf in "Quota-Einheiten" ab und setzt den Zaehler um
 * Mitternacht (Pacific Time, hier vereinfacht UTC) zurueck. Ein Projekt hat standardmaessig
 * 10.000 Einheiten pro Tag:
 *
 * <ul>
 *   <li>{@code search.list} kostet {@value #COST_SEARCH} Einheiten</li>
 *   <li>{@code videos.list}, {@code channels.list}, {@code playlistItems.list}
 *       kosten je {@value #COST_LIST} Einheit</li>
 * </ul>
 *
 * <p>Ohne diese Bremse wuerde die App nach rund 100 Suchen kommentarlos aufhoeren zu
 * funktionieren. Stattdessen wird der Aufruf vorher abgelehnt und die Ursache benannt.
 *
 * <p>Die Klasse ist thread-sicher: Zaehlerstand und Tageswechsel werden unter einem
 * gemeinsamen Monitor gefuehrt, damit parallele Requests sich nicht gegenseitig ueberholen.
 */
@Component
public class QuotaGuard {

    /** Kosten eines {@code search.list}-Aufrufs in Quota-Einheiten. */
    public static final int COST_SEARCH = 100;
    /** Kosten eines listenden Aufrufs (videos, channels, playlistItems). */
    public static final int COST_LIST = 1;

    private static final Logger log = LoggerFactory.getLogger(QuotaGuard.class);

    private final long dailyLimit;
    private final Clock clock;

    private LocalDate currentDay;
    private long used;

    /**
     * @param properties Konfiguration mit dem Tageskontingent
     * @param clock      injizierte Uhr - im Test eine verschiebbare, damit der
     *                   naechtliche Reset pruefbar bleibt
     */
    public QuotaGuard(CleanTubeProperties properties, Clock clock) {
        this.dailyLimit = properties.youtube().dailyQuota();
        this.clock = clock;
        this.currentDay = LocalDate.now(clock);
    }

    /**
     * Bucht Einheiten, sofern das Kontingent reicht.
     *
     * @param units Kosten des geplanten Aufrufs
     * @throws QuotaExceededException wenn das Kontingent nicht ausreicht; es wird dann
     *                                nichts gebucht
     */
    public synchronized void consume(int units) {
        rolloverIfNewDay();
        if (used + units > dailyLimit) {
            throw new QuotaExceededException(used, dailyLimit);
        }
        used += units;
        if (used > dailyLimit * 0.8) {
            log.warn("YouTube-Quota zu ueber 80 % verbraucht: {} von {} Einheiten", used, dailyLimit);
        }
    }

    /** Aktueller Stand des Kontingents. */
    public synchronized QuotaStatus status() {
        rolloverIfNewDay();
        return new QuotaStatus(currentDay, used, dailyLimit, Math.max(0, dailyLimit - used));
    }

    /** Setzt den Zaehler zurueck, sobald ein neuer Tag begonnen hat. */
    private void rolloverIfNewDay() {
        LocalDate today = LocalDate.now(clock);
        if (!today.equals(currentDay)) {
            log.info("Neuer Tag {} - Quota-Zaehler zurueckgesetzt (Vortag: {} Einheiten)", today, used);
            currentDay = today;
            used = 0;
        }
    }
}
