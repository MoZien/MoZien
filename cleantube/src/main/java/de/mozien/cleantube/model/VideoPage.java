package de.mozien.cleantube.model;

import java.util.List;

/**
 * Eine Seite von Videos samt Cursor fuer die Folgeseite.
 *
 * <p>Die YouTube-API arbeitet mit undurchsichtigen Seiten-Token statt mit Offsets;
 * dieses Modell reicht das Token unveraendert an das Frontend durch.
 *
 * @param items         Videos dieser Seite
 * @param nextPageToken Token fuer die naechste Seite; {@code null} am Ende der Liste
 */
public record VideoPage(List<VideoSummary> items, String nextPageToken) {

    public static VideoPage empty() {
        return new VideoPage(List.of(), null);
    }
}
