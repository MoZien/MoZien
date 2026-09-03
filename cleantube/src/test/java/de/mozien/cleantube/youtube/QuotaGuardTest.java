package de.mozien.cleantube.youtube;

import de.mozien.cleantube.TestFixtures;
import de.mozien.cleantube.model.QuotaStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Prueft die Buchhaltung ueber das YouTube-Tageskontingent.
 *
 * <p>Die Klasse ist der wichtigste Schutz vor einem stillen Totalausfall der App,
 * deshalb wird auch der Tageswechsel explizit getestet.
 */
class QuotaGuardTest {

    /** Verschiebbare Uhr, um einen Tageswechsel im Test auszuloesen. */
    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-05-01T10:00:00Z");

        void advance(Duration amount) {
            now = now.plus(amount);
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @Test
    @DisplayName("bucht Einheiten und meldet den Reststand")
    void bucht_einheiten() {
        QuotaGuard guard = new QuotaGuard(TestFixtures.properties(1_000), new TestClock());

        guard.consume(QuotaGuard.COST_SEARCH);
        guard.consume(QuotaGuard.COST_LIST);

        QuotaStatus status = guard.status();
        assertThat(status.used()).isEqualTo(101);
        assertThat(status.limit()).isEqualTo(1_000);
        assertThat(status.remaining()).isEqualTo(899);
    }

    @Test
    @DisplayName("lehnt einen Aufruf ab, der das Kontingent sprengen wuerde")
    void lehnt_ueberschreitung_ab() {
        QuotaGuard guard = new QuotaGuard(TestFixtures.properties(150), new TestClock());
        guard.consume(QuotaGuard.COST_SEARCH);

        assertThatThrownBy(() -> guard.consume(QuotaGuard.COST_SEARCH))
                .isInstanceOf(QuotaExceededException.class)
                .hasMessageContaining("100 von 150");
    }

    @Test
    @DisplayName("bucht nichts, wenn der Aufruf abgelehnt wird")
    void bucht_nichts_bei_ablehnung() {
        QuotaGuard guard = new QuotaGuard(TestFixtures.properties(150), new TestClock());
        guard.consume(QuotaGuard.COST_SEARCH);

        assertThatThrownBy(() -> guard.consume(QuotaGuard.COST_SEARCH))
                .isInstanceOf(QuotaExceededException.class);

        // Der fehlgeschlagene Versuch darf den Zaehler nicht erhoeht haben,
        // sonst waere das Kontingent nach wenigen Fehlversuchen dauerhaft blockiert.
        assertThat(guard.status().used()).isEqualTo(100);
        assertThatCode(() -> guard.consume(50)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("setzt den Zaehler beim Tageswechsel zurueck")
    void setzt_bei_tageswechsel_zurueck() {
        TestClock clock = new TestClock();
        QuotaGuard guard = new QuotaGuard(TestFixtures.properties(150), clock);
        guard.consume(QuotaGuard.COST_SEARCH);

        clock.advance(Duration.ofDays(1));

        assertThat(guard.status().used()).isZero();
        assertThatCode(() -> guard.consume(QuotaGuard.COST_SEARCH)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("zaehlt auch bei parallelen Zugriffen korrekt")
    void zaehlt_thread_sicher() throws InterruptedException {
        QuotaGuard guard = new QuotaGuard(TestFixtures.properties(10_000), new TestClock());

        Runnable task = () -> {
            for (int i = 0; i < 100; i++) {
                guard.consume(QuotaGuard.COST_LIST);
            }
        };
        Thread first = new Thread(task);
        Thread second = new Thread(task);
        first.start();
        second.start();
        first.join();
        second.join();

        assertThat(guard.status().used()).isEqualTo(200);
    }
}
