/**
 * Wiedergabe über den offiziellen YouTube-IFrame-Player.
 *
 * Zwei bewusste Entscheidungen:
 *
 * 1. Als Host wird `youtube-nocookie.com` verwendet. YouTube setzt dann erst beim
 *    tatsächlichen Start der Wiedergabe Cookies – aus Datenschutzsicht (DSGVO) der
 *    deutlich sauberere Weg beim Einbetten fremder Inhalte.
 *
 * 2. Das Überspringen von Sponsor-Abschnitten geschieht ausschließlich über die
 *    offizielle Methode `seekTo()` – also genau so, wie ein Mensch vorspulen würde.
 *    Es wird kein Netzwerk-Request blockiert und nichts an YouTubes Auslieferung
 *    verändert.
 */

import { toast } from './dom.js';
import { categoryLabel, formatSeconds } from './format.js';

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const TICK_INTERVAL_MS = 250;
/** Kurz vor Segmentende nicht mehr springen – sonst hängt der Player am Rand fest. */
const SKIP_MARGIN_SECONDS = 0.3;

let apiPromise = null;

/**
 * Lädt die IFrame-Player-API genau einmal und liefert danach `window.YT`.
 * Die API meldet sich über den globalen Callback `onYouTubeIframeAPIReady`.
 */
function loadIframeApi() {
    if (apiPromise) return apiPromise;

    apiPromise = new Promise((resolve, reject) => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }

        window.onYouTubeIframeAPIReady = () => resolve(window.YT);

        const script = document.createElement('script');
        script.src = IFRAME_API_URL;
        script.async = true;
        script.onerror = () => reject(new Error('Der YouTube-Player konnte nicht geladen werden.'));
        document.head.append(script);
    });

    return apiPromise;
}

/** Kapselt einen laufenden Player samt Sprunglogik. */
export class CleanPlayer {

    /**
     * @param {HTMLElement} mount   Container, der durch das IFrame ersetzt wird
     * @param {string}      videoId YouTube-Video-ID
     */
    constructor(mount, videoId) {
        this.mount = mount;
        this.videoId = videoId;
        this.player = null;
        this.segments = [];
        this.skipEnabled = true;
        /** Bereits übersprungene oder vom Nutzer wieder freigegebene Abschnitte. */
        this.handled = new Set();
        this.timer = null;
    }

    /** Baut den Player auf. Wird beim Verlassen der Seite durch `destroy()` abgeräumt. */
    async mountPlayer() {
        const YT = await loadIframeApi();

        this.player = new YT.Player(this.mount, {
            host: 'https://www.youtube-nocookie.com',
            videoId: this.videoId,
            playerVars: {
                rel: 0,                 // keine fremden Videovorschläge am Ende
                modestbranding: 1,
                iv_load_policy: 3,      // keine eingeblendeten Annotationen
                playsinline: 1,
                origin: window.location.origin
            },
            events: {
                onStateChange: (event) => this.#onStateChange(event, YT)
            }
        });
    }

    /** Setzt die zu überspringenden Abschnitte (aufsteigend sortiert erwartet). */
    setSegments(segments) {
        this.segments = Array.isArray(segments) ? segments : [];
    }

    /** Schaltet das Überspringen zur Laufzeit ein oder aus. */
    setSkipEnabled(enabled) {
        this.skipEnabled = enabled;
        if (!enabled) this.#stopTicking();
        else if (this.#isPlaying()) this.#startTicking();
    }

    /** Stoppt Timer und entfernt das IFrame. */
    destroy() {
        this.#stopTicking();
        if (this.player && typeof this.player.destroy === 'function') {
            this.player.destroy();
        }
        this.player = null;
    }

    #onStateChange(event, YT) {
        if (event.data === YT.PlayerState.PLAYING) {
            this.#startTicking();
        } else {
            this.#stopTicking();
        }
    }

    #isPlaying() {
        return this.player
            && typeof this.player.getPlayerState === 'function'
            && this.player.getPlayerState() === 1; // 1 = PLAYING
    }

    #startTicking() {
        if (this.timer || !this.skipEnabled || this.segments.length === 0) return;
        this.timer = setInterval(() => this.#tick(), TICK_INTERVAL_MS);
    }

    #stopTicking() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Prüft viermal pro Sekunde, ob die Abspielposition in einem Sponsor-Abschnitt liegt. */
    #tick() {
        if (!this.skipEnabled || !this.player || typeof this.player.getCurrentTime !== 'function') return;

        const now = this.player.getCurrentTime();
        const index = this.segments.findIndex((segment, i) =>
            !this.handled.has(i)
            && now >= segment.startSeconds
            && now < segment.endSeconds - SKIP_MARGIN_SECONDS);

        if (index === -1) return;

        const segment = this.segments[index];
        this.handled.add(index);
        this.player.seekTo(segment.endSeconds, true);

        toast(
            `${categoryLabel(segment.category)} übersprungen (${formatSeconds(segment.durationSeconds ?? segment.endSeconds - segment.startSeconds)})`,
            {
                label: 'Rückgängig',
                run: () => {
                    // Der Abschnitt bleibt als "erledigt" markiert, damit er nicht sofort
                    // erneut übersprungen wird, wenn der Nutzer ihn bewusst sehen will.
                    this.player.seekTo(segment.startSeconds, true);
                }
            }
        );
    }
}
