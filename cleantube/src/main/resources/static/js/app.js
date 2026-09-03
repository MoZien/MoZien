/**
 * Einstiegspunkt des Frontends: Router, Suchfeld und Statusanzeige.
 *
 * Bewusst ohne Framework – die Anwendung hat vier Ansichten, und ein
 * Hash-basierter Router dafür bleibt in einer Datei überschaubar und
 * kommt ohne Build-Schritt aus.
 */

import { fetchStatus } from './api.js';
import { disposeActivePlayer, renderChannel, renderHome, renderNotFound, renderSearch, renderWatch } from './views.js';

const view = document.getElementById('view');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const quotaBadge = document.getElementById('quota-badge');

/** Aus /api/status geladene Einstellungen des Backends. */
const appStatus = { regionCode: null };

/* ------------------------------------------------------------------- Routing */

/**
 * Zerlegt den Hash in Route und Parameter.
 * Unterstützt `#/`, `#/search/<begriff>`, `#/watch/<id>` und `#/channel/<id>`.
 */
function parseRoute(hash) {
    const path = hash.replace(/^#\/?/, '');
    if (path === '') return { name: 'home' };

    const [segment, ...rest] = path.split('/');
    const value = decodeURIComponent(rest.join('/'));

    if (segment === 'search' && value) return { name: 'search', query: value };
    if (segment === 'watch' && value) return { name: 'watch', videoId: value };
    if (segment === 'channel' && value) return { name: 'channel', channelId: value };
    return { name: 'notFound' };
}

async function router() {
    const route = parseRoute(window.location.hash);

    // Ein laufender Player muss vor jedem Seitenwechsel abgeräumt werden,
    // sonst spielt der Ton im Hintergrund weiter.
    disposeActivePlayer();
    window.scrollTo({ top: 0 });

    switch (route.name) {
        case 'home':
            document.title = 'CleanTube';
            searchInput.value = '';
            await renderHome(view, appStatus.regionCode);
            break;
        case 'search':
            document.title = `${route.query} – CleanTube`;
            searchInput.value = route.query;
            await renderSearch(view, route.query);
            break;
        case 'watch':
            document.title = 'Wiedergabe – CleanTube';
            await renderWatch(view, route.videoId);
            break;
        case 'channel':
            document.title = 'Kanal – CleanTube';
            await renderChannel(view, route.channelId);
            break;
        default:
            document.title = 'Nicht gefunden – CleanTube';
            renderNotFound(view);
    }

    // Nach dem Seitenwechsel den Fokus setzen, damit Screenreader den neuen
    // Inhalt vorlesen und die Tastaturnavigation nicht am Seitenanfang klebt.
    view.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------- Bausteine */

searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    const target = `#/search/${encodeURIComponent(query)}`;
    // Bei identischer Suche feuert `hashchange` nicht – dann neu zeichnen.
    if (window.location.hash === target) router();
    else window.location.hash = target;
});

/**
 * Zeigt den Rest des Tageskontingents an, sobald es knapp wird.
 *
 * Die Grenze der YouTube-API ist die wichtigste Betriebsgrenze dieser Anwendung.
 * Sie sichtbar zu machen ist ehrlicher, als den Nutzer irgendwann in einen
 * unerklärlichen Fehler laufen zu lassen.
 */
async function loadStatus() {
    try {
        const status = await fetchStatus();
        appStatus.regionCode = status.regionCode;

        const { used, limit, remaining } = status.quota;
        const usedShare = limit > 0 ? used / limit : 0;

        if (usedShare >= 0.5) {
            quotaBadge.textContent = `API-Kontingent: ${remaining} von ${limit}`;
            quotaBadge.classList.toggle('badge-warning', usedShare >= 0.8);
            quotaBadge.hidden = false;
        }
    } catch {
        // Die Statusanzeige ist Beiwerk; ein Ausfall darf die App nicht blockieren.
    }
}

window.addEventListener('hashchange', router);

await loadStatus();
await router();
