package de.mozien.cleantube.api;

import de.mozien.cleantube.model.ChannelInfo;
import de.mozien.cleantube.model.VideoDetails;
import de.mozien.cleantube.model.VideoPage;
import de.mozien.cleantube.youtube.YouTubeService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Oeffentliche REST-Schnittstelle fuer Videos und Kanaele.
 *
 * <p>Das Frontend spricht ausschliesslich mit diesen Endpunkten und nie direkt mit Google.
 * Dadurch bleibt der API-Key serverseitig und das Kontingent kontrollierbar.
 *
 * <p>Alle Eingaben werden validiert: YouTube-Video-IDs sind immer genau elf Zeichen aus
 * {@code [A-Za-z0-9_-]}. Was diesem Muster nicht entspricht, erreicht die Google-API gar
 * nicht erst und verbraucht folglich auch keine Quota.
 */
@Validated
@RestController
@RequestMapping("/api")
public class CatalogController {

    private static final String VIDEO_ID = "^[A-Za-z0-9_-]{11}$";
    private static final String CHANNEL_ID = "^[A-Za-z0-9_-]{1,64}$";
    private static final String PAGE_TOKEN = "^[A-Za-z0-9_\\-=]{0,128}$";

    private final YouTubeService youTubeService;

    public CatalogController(YouTubeService youTubeService) {
        this.youTubeService = youTubeService;
    }

    /** Startseite: aktuell beliebte Videos. */
    @GetMapping("/videos")
    public VideoPage trending(
            @RequestParam(required = false) @Pattern(regexp = PAGE_TOKEN) String pageToken) {
        return youTubeService.trending(pageToken);
    }

    /** Volltextsuche. */
    @GetMapping("/search")
    public VideoPage search(
            @RequestParam @NotBlank @Size(max = 100) String q,
            @RequestParam(required = false) @Pattern(regexp = PAGE_TOKEN) String pageToken) {
        return youTubeService.search(q, pageToken);
    }

    /** Daten der Wiedergabeseite. */
    @GetMapping("/videos/{videoId}")
    public VideoDetails video(@PathVariable @Pattern(regexp = VIDEO_ID) String videoId) {
        return youTubeService.videoDetails(videoId);
    }

    /** Stammdaten eines Kanals. */
    @GetMapping("/channels/{channelId}")
    public ChannelInfo channel(@PathVariable @Pattern(regexp = CHANNEL_ID) String channelId) {
        return youTubeService.channel(channelId);
    }

    /** Videos eines Kanals, chronologisch absteigend. */
    @GetMapping("/channels/{channelId}/videos")
    public VideoPage channelVideos(
            @PathVariable @Pattern(regexp = CHANNEL_ID) String channelId,
            @RequestParam(required = false) @Pattern(regexp = PAGE_TOKEN) String pageToken) {
        return youTubeService.channelVideos(channelId, pageToken);
    }
}
