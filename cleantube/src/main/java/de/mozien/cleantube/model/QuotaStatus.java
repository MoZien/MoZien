package de.mozien.cleantube.model;

import java.time.LocalDate;

/**
 * Momentaufnahme des YouTube-Tageskontingents.
 *
 * <p>Wird im Frontend als Statusanzeige gerendert und macht die wichtigste
 * Betriebsgrenze des Systems fuer den Nutzer sichtbar.
 *
 * @param date      Tag, auf den sich der Verbrauch bezieht (UTC, wie bei Google)
 * @param used      bereits verbrauchte Quota-Einheiten
 * @param limit     Tageskontingent
 * @param remaining verbleibende Einheiten
 */
public record QuotaStatus(LocalDate date, long used, long limit, long remaining) {
}
