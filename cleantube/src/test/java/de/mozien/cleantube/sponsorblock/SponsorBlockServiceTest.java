package de.mozien.cleantube.sponsorblock;

import de.mozien.cleantube.TestFixtures;
import de.mozien.cleantube.config.CleanTubeProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Prueft die SponsorBlock-Anbindung.
 *
 * <p>Schwerpunkt ist die Robustheit: Die Community-API ist eine freiwillige
 * Zusatzquelle. Faellt sie aus, muss das Video trotzdem abspielbar bleiben.
 */
class SponsorBlockServiceTest {

    private MockRestServiceServer server;
    private SponsorBlockService service;

    private void setUp(CleanTubeProperties properties) {
        RestClient.Builder builder = RestClient.builder().baseUrl(properties.sponsorBlock().baseUrl());
        server = MockRestServiceServer.bindTo(builder).build();
        service = new SponsorBlockService(builder, properties);
    }

    private void setUp() {
        setUp(TestFixtures.properties());
    }

    @Test
    @DisplayName("liest Segmente und sortiert sie nach Startzeit")
    void liest_und_sortiert_segmente() {
        setUp();
        server.expect(requestTo(startsWith(TestFixtures.SPONSORBLOCK_BASE_URL + "/api/skipSegments?")))
                .andExpect(queryParam("videoID", "dQw4w9WgXcQ"))
                .andExpect(queryParam("category", "sponsor", "selfpromo"))
                .andRespond(withSuccess("""
                        [
                          {"category":"selfpromo","actionType":"skip","segment":[300.0,320.0],"votes":3},
                          {"category":"sponsor","actionType":"skip","segment":[10.5,42.0],"votes":12}
                        ]
                        """, MediaType.APPLICATION_JSON));

        List<SkipSegment> segments = service.segments("dQw4w9WgXcQ");

        assertThat(segments).hasSize(2);
        assertThat(segments.getFirst().category()).isEqualTo("sponsor");
        assertThat(segments.getFirst().startSeconds()).isEqualTo(10.5);
        assertThat(segments.getFirst().durationSeconds()).isEqualTo(31.5);
        assertThat(segments.getLast().category()).isEqualTo("selfpromo");
        server.verify();
    }

    @Test
    @DisplayName("verwendet nur Segmente vom Typ 'skip'")
    void filtert_andere_aktionstypen() {
        setUp();
        server.expect(requestTo(startsWith(TestFixtures.SPONSORBLOCK_BASE_URL)))
                .andRespond(withSuccess("""
                        [
                          {"category":"sponsor","actionType":"mute","segment":[10.0,20.0]},
                          {"category":"sponsor","actionType":"poi","segment":[30.0,30.0]},
                          {"category":"sponsor","actionType":"skip","segment":[40.0,55.0]}
                        ]
                        """, MediaType.APPLICATION_JSON));

        // "mute" und "poi" wuerden im Player etwas anderes bedeuten als Vorspulen.
        assertThat(service.segments("dQw4w9WgXcQ")).singleElement()
                .extracting(SkipSegment::startSeconds).isEqualTo(40.0);
    }

    @Test
    @DisplayName("verwirft unplausible Segmente")
    void verwirft_unplausible_segmente() {
        setUp();
        server.expect(requestTo(startsWith(TestFixtures.SPONSORBLOCK_BASE_URL)))
                .andRespond(withSuccess("""
                        [
                          {"category":"sponsor","actionType":"skip","segment":[50.0,40.0]},
                          {"category":"sponsor","actionType":"skip","segment":[10.0]},
                          {"category":"sponsor","actionType":"skip","segment":null}
                        ]
                        """, MediaType.APPLICATION_JSON));

        assertThat(service.segments("dQw4w9WgXcQ")).isEmpty();
    }

    @Test
    @DisplayName("wertet HTTP 404 mit text/plain-Rumpf als 'keine Segmente vorhanden'")
    void behandelt_404_als_leer() {
        setUp();
        server.expect(requestTo(startsWith(TestFixtures.SPONSORBLOCK_BASE_URL)))
                .andRespond(withStatus(HttpStatus.NOT_FOUND)
                        .contentType(MediaType.TEXT_PLAIN)
                        .body("Not Found"));

        // Genau so antwortet die echte API fuer Videos ohne gemeldete Abschnitte:
        // 404 mit einem Klartext-Rumpf. Wer den Rumpf konvertiert, bevor er den
        // Statuscode prueft, laeuft hier in einen Konvertierungsfehler.
        assertThat(service.segments("dQw4w9WgXcQ")).isEmpty();
    }

    @Test
    @DisplayName("liefert bei einer Stoerung eine leere Liste statt eines Fehlers")
    void bleibt_bei_stoerung_still() {
        setUp();
        server.expect(requestTo(startsWith(TestFixtures.SPONSORBLOCK_BASE_URL)))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThat(service.segments("dQw4w9WgXcQ")).isEmpty();
    }

    @Test
    @DisplayName("ruft die API gar nicht auf, wenn das Feature abgeschaltet ist")
    void ruft_bei_abgeschaltetem_feature_nicht_auf() {
        CleanTubeProperties basis = TestFixtures.properties();
        CleanTubeProperties aus = new CleanTubeProperties(basis.youtube(),
                new CleanTubeProperties.SponsorBlock(false, TestFixtures.SPONSORBLOCK_BASE_URL,
                        List.of("sponsor"), Duration.ofSeconds(2), Duration.ofMinutes(1)));
        setUp(aus);

        assertThat(service.isEnabled()).isFalse();
        assertThat(service.segments("dQw4w9WgXcQ")).isEmpty();
        server.verify(); // kein einziger HTTP-Aufruf
    }
}
