package de.mozien.cleantube.youtube;

/**
 * Wird geworfen, wenn ein Aufruf das Tageskontingent der YouTube Data API sprengen wuerde.
 *
 * <p>Bewusst eine eigene Ausnahme: Der Fall ist kein technischer Fehler, sondern eine
 * fachliche Betriebsgrenze und wird dem Nutzer als HTTP 429 mit erklaerendem Text
 * zurueckgemeldet.
 */
public class QuotaExceededException extends RuntimeException {

    private final long used;
    private final long limit;

    public QuotaExceededException(long used, long limit) {
        super("Tageskontingent der YouTube Data API erschoepft (%d von %d Einheiten verbraucht)"
                .formatted(used, limit));
        this.used = used;
        this.limit = limit;
    }

    public long getUsed() {
        return used;
    }

    public long getLimit() {
        return limit;
    }
}
