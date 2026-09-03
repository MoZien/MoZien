package de.mozien.cleantube.youtube;

import de.mozien.cleantube.config.CacheConfig;
import de.mozien.cleantube.model.ChannelInfo;
import de.mozien.cleantube.youtube.YouTubeResponses.ChannelItem;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Laedt Kanal-Stammdaten.
 *
 * <p>Bewusst ein eigener Service und keine Methode im {@link YouTubeService}: Ruft eine
 * Bean eine ihrer eigenen {@code @Cacheable}-Methoden auf, laeuft der Aufruf am Spring-Proxy
 * vorbei und der Cache greift nicht (Selbstaufruf-Problem). Da {@link YouTubeService}
 * die Kanaldaten fuer die Kanalseite braucht, liegen sie hier in einer separaten Bean -
 * so wirkt der Cache auch beim internen Aufruf.
 */
@Service
public class ChannelService {

    private final YouTubeClient client;
    private final YouTubeMapper mapper;

    public ChannelService(YouTubeClient client, YouTubeMapper mapper) {
        this.client = client;
        this.mapper = mapper;
    }

    /**
     * @param channelId YouTube-Kanal-ID
     * @throws ResourceNotFoundException wenn der Kanal nicht existiert oder nicht oeffentlich ist
     */
    @Cacheable(cacheNames = CacheConfig.CHANNEL, key = "#channelId")
    public ChannelInfo channel(String channelId) {
        ChannelItem item = client.channel(channelId).itemsOrEmpty().stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Kanal %s nicht gefunden".formatted(channelId)));
        ChannelInfo info = mapper.toChannelInfo(item);
        if (info == null) {
            throw new ResourceNotFoundException("Kanal %s liefert keine Daten".formatted(channelId));
        }
        return info;
    }
}
