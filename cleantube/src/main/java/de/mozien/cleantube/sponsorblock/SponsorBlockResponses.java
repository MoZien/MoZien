package de.mozien.cleantube.sponsorblock;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/** Abbild der JSON-Antwort der SponsorBlock-API. */
public final class SponsorBlockResponses {

    private SponsorBlockResponses() {
    }

    /**
     * Ein Segment, wie die API es liefert.
     *
     * @param segment    Zwei-elementige Liste [Start, Ende] in Sekunden
     * @param actionType {@code skip}, {@code mute}, {@code poi} oder {@code full};
     *                   CleanTube verarbeitet nur {@code skip}
     * @param votes      Community-Bewertung; negative Werte deuten auf falsche Meldungen hin
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RawSegment(String category, String actionType, List<Double> segment, Integer votes) {

        public boolean isUsable() {
            return "skip".equals(actionType)
                    && segment != null
                    && segment.size() == 2
                    && segment.get(0) != null
                    && segment.get(1) != null
                    && segment.get(1) > segment.get(0);
        }
    }
}
