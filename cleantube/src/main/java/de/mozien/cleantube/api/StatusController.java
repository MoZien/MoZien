package de.mozien.cleantube.api;

import de.mozien.cleantube.config.CleanTubeProperties;
import de.mozien.cleantube.model.AppStatus;
import de.mozien.cleantube.sponsorblock.SponsorBlockService;
import de.mozien.cleantube.youtube.QuotaGuard;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Selbstauskunft der Anwendung.
 *
 * <p>Das Frontend fragt diesen Endpunkt beim Start ab, um Funktionsschalter zu setzen
 * und den Quota-Stand anzuzeigen. Damit wird die zentrale Betriebsgrenze des Systems
 * fuer den Nutzer sichtbar, statt sich in einem unerklaerlichen Fehler zu aeussern.
 */
@RestController
@RequestMapping("/api")
public class StatusController {

    private final QuotaGuard quotaGuard;
    private final SponsorBlockService sponsorBlockService;
    private final CleanTubeProperties properties;

    public StatusController(QuotaGuard quotaGuard,
                            SponsorBlockService sponsorBlockService,
                            CleanTubeProperties properties) {
        this.quotaGuard = quotaGuard;
        this.sponsorBlockService = sponsorBlockService;
        this.properties = properties;
    }

    @GetMapping("/status")
    public AppStatus status() {
        return new AppStatus(
                quotaGuard.status(),
                sponsorBlockService.isEnabled(),
                properties.youtube().regionCode());
    }
}
