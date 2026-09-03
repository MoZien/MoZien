package de.mozien.cleantube.api;

import de.mozien.cleantube.youtube.QuotaExceededException;
import de.mozien.cleantube.youtube.ResourceNotFoundException;
import de.mozien.cleantube.youtube.YouTubeApiException;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

/**
 * Uebersetzt Ausnahmen in aussagekraeftige HTTP-Antworten.
 *
 * <p>Leitgedanke: Der Nutzer soll erfahren, <i>warum</i> etwas nicht geht. Gerade das
 * erschoepfte Tageskontingent ist bei einem YouTube-Client der haeufigste Stolperstein
 * und wuerde als nacktes HTTP 500 voellig unverstaendlich bleiben.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** Video oder Kanal existiert nicht (oder ist nicht oeffentlich). */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(ResourceNotFoundException e) {
        return build(HttpStatus.NOT_FOUND, "not_found", e.getMessage());
    }

    /**
     * Tageskontingent aufgebraucht.
     *
     * <p>HTTP 429 ist hier korrekter als 500: Der Fehler liegt nicht am Code, sondern an
     * einer Mengenbegrenzung, und er verschwindet um Mitternacht von selbst.
     */
    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleQuota(QuotaExceededException e) {
        log.warn("Anfrage abgelehnt: {}", e.getMessage());
        return build(HttpStatus.TOO_MANY_REQUESTS, "quota_exceeded",
                "Das Tageskontingent der YouTube-API ist aufgebraucht. "
                        + "Es wird um Mitternacht (UTC) zurueckgesetzt.");
    }

    /** Google hat mit einem Fehler geantwortet oder war nicht erreichbar. */
    @ExceptionHandler(YouTubeApiException.class)
    public ResponseEntity<ApiErrorResponse> handleUpstream(YouTubeApiException e) {
        log.error("Fehler beim Zugriff auf die YouTube-API", e);
        return build(HttpStatus.BAD_GATEWAY, "upstream_error",
                "Die YouTube-API konnte die Anfrage gerade nicht beantworten.");
    }

    /**
     * Ungueltige Parameter, z. B. eine Video-ID im falschen Format.
     *
     * <p>Zwei Ausnahmetypen, weil Spring die Methodenvalidierung je nach Konfiguration
     * ueber einen AOP-Proxy ({@link ConstraintViolationException}) oder ueber die in
     * Spring MVC eingebaute Pruefung ({@link HandlerMethodValidationException}) meldet.
     */
    @ExceptionHandler({ConstraintViolationException.class, HandlerMethodValidationException.class,
            MissingServletRequestParameterException.class})
    public ResponseEntity<ApiErrorResponse> handleInvalidInput(Exception e) {
        return build(HttpStatus.BAD_REQUEST, "invalid_request",
                "Die Anfrage enthaelt ungueltige oder fehlende Parameter.");
    }

    /** Auffangnetz - der Stacktrace bleibt im Log, der Client bekennt nur den Statuscode. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception e) {
        log.error("Unerwarteter Fehler", e);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
                "Unerwarteter Fehler. Bitte spaeter erneut versuchen.");
    }

    private ResponseEntity<ApiErrorResponse> build(HttpStatus status, String error, String message) {
        return ResponseEntity.status(status).body(ApiErrorResponse.of(status.value(), error, message));
    }
}
