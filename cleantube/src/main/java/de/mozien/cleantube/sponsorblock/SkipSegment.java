package de.mozien.cleantube.sponsorblock;

/**
 * Ein zu ueberspringender Abschnitt innerhalb eines Videos.
 *
 * @param category      Art des Abschnitts, z. B. {@code sponsor}, {@code selfpromo}, {@code intro}
 * @param startSeconds  Beginn in Sekunden ab Videostart
 * @param endSeconds    Ende in Sekunden ab Videostart
 */
public record SkipSegment(String category, double startSeconds, double endSeconds) {

    public double durationSeconds() {
        return Math.max(0, endSeconds - startSeconds);
    }
}
