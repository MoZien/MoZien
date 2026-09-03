package de.mozien.cleantube.youtube;

/** Signalisiert, dass ein Aufruf der YouTube Data API v3 fehlgeschlagen ist. */
public class YouTubeApiException extends RuntimeException {

    public YouTubeApiException(String message) {
        super(message);
    }

    public YouTubeApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
