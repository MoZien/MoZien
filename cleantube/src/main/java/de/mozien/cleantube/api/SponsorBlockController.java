package de.mozien.cleantube.api;

import de.mozien.cleantube.sponsorblock.SkipSegment;
import de.mozien.cleantube.sponsorblock.SponsorBlockService;
import jakarta.validation.constraints.Pattern;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Liefert die Abschnitte, die der Player im Video ueberspringen soll.
 *
 * <p>Gemeint sind ausschliesslich vom Creator selbst eingebaute Werbeblöcke
 * (Sponsor-Lesungen, Eigenwerbung, Intros) - nicht die von YouTube ausgelieferten Anzeigen.
 */
@Validated
@RestController
@RequestMapping("/api")
public class SponsorBlockController {

    private static final String VIDEO_ID = "^[A-Za-z0-9_-]{11}$";

    private final SponsorBlockService sponsorBlockService;

    public SponsorBlockController(SponsorBlockService sponsorBlockService) {
        this.sponsorBlockService = sponsorBlockService;
    }

    @GetMapping("/videos/{videoId}/skip-segments")
    public List<SkipSegment> skipSegments(@PathVariable @Pattern(regexp = VIDEO_ID) String videoId) {
        return sponsorBlockService.segments(videoId);
    }
}
