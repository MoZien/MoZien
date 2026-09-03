package de.mozien.cleantube.model;

/**
 * Selbstauskunft der Anwendung fuer das Frontend.
 *
 * @param quota               aktueller Stand des YouTube-Tageskontingents
 * @param sponsorBlockEnabled ob das Ueberspringen von Sponsor-Abschnitten aktiv ist
 * @param regionCode          Region, aus der die Startseite bestueckt wird
 */
public record AppStatus(QuotaStatus quota, boolean sponsorBlockEnabled, String regionCode) {
}
