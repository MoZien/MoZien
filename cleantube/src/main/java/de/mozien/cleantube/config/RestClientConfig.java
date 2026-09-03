package de.mozien.cleantube.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Stellt je einen vorkonfigurierten {@link RestClient.Builder} fuer die beiden externen
 * APIs bereit.
 *
 * <p>Bewusst werden die <i>Builder</i> als Beans veroeffentlicht und nicht die fertigen
 * Clients: So kann ein Test per {@code MockRestServiceServer.bindTo(builder)} eine
 * Attrappe einhaengen und die HTTP-Schicht ohne echte Netzwerkaufrufe pruefen.
 */
@Configuration
public class RestClientConfig {

    private static final String USER_AGENT = "CleanTube/1.0 (Hochschulprojekt)";

    @Bean
    public RestClient.Builder youTubeRestClientBuilder(CleanTubeProperties properties) {
        return RestClient.builder()
                .baseUrl(properties.youtube().baseUrl())
                .defaultHeader("User-Agent", USER_AGENT)
                .requestFactory(requestFactory(properties.youtube().timeout()));
    }

    /** Die SponsorBlock-API bittet Clients ausdruecklich um einen identifizierbaren User-Agent. */
    @Bean
    public RestClient.Builder sponsorBlockRestClientBuilder(CleanTubeProperties properties) {
        return RestClient.builder()
                .baseUrl(properties.sponsorBlock().baseUrl())
                .defaultHeader("User-Agent", USER_AGENT)
                .requestFactory(requestFactory(properties.sponsorBlock().timeout()));
    }

    private SimpleClientHttpRequestFactory requestFactory(Duration timeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        Duration effective = timeout != null ? timeout : Duration.ofSeconds(10);
        factory.setConnectTimeout(effective);
        factory.setReadTimeout(effective);
        return factory;
    }
}
