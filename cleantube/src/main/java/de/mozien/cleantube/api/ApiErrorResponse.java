package de.mozien.cleantube.api;

import java.time.Instant;

/**
 * Einheitliches Fehlerformat aller Endpunkte.
 *
 * @param status    HTTP-Statuscode
 * @param error     kurzer, maschinenlesbarer Fehlerschluessel
 * @param message   fuer Menschen lesbare Erklaerung (wird im Frontend angezeigt)
 * @param timestamp Zeitpunkt des Fehlers
 */
public record ApiErrorResponse(int status, String error, String message, Instant timestamp) {

    public static ApiErrorResponse of(int status, String error, String message) {
        return new ApiErrorResponse(status, error, message, Instant.now());
    }
}
