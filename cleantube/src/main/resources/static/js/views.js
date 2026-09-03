/** Aufbau der einzelnen Seiten. */

import { el, replace } from './dom.js';
import {
    categoryLabel, formatCount, formatPublished, formatSeconds, formatViews, joinMeta
} from './format.js';
import {
    ApiError, fetchChannel, fetchChannelVideos, fetchSearch, fetchSkipSegments, fetchTrending, fetchVideo
} from './api.js';
import { CleanPlayer } from './player.js';

/** Der jeweils laufende Player – wird bei jedem Seitenwechsel abgeräumt. */
let activePlayer = null;

export function disposeActivePlayer() {
    if (activePlayer) {
        activePlayer.destroy();
        activePlayer = null;
    }
}

/* ------------------------------------------------------------------ Bausteine */

/** Eine Kachel im Videoraster. */
function videoCard(video) {
    const duration = formatSeconds(video.durationSeconds);

    const thumb = el('div', { class: 'thumb' }, [
        el('img', {
            src: video.thumbnailUrl ?? '',
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            // Referrer unterdrücken: Googles Bild-CDN erfährt nicht, welche Seite das Bild lädt.
            referrerpolicy: 'no-referrer'
        }),
        video.live ? el('span', { class: 'thumb-live', text: 'Live' }) : null,
        !video.live && duration ? el('span', { class: 'thumb-duration', text: duration }) : null
    ]);

    return el('article', { class: 'card' }, [
        el('a', { href: `#/watch/${video.id}`, 'aria-label': video.title ?? 'Video' }, thumb),
        el('div', {}, [
            el('a', { href: `#/watch/${video.id}` },
                el('h3', { class: 'card-title', text: video.title ?? 'Ohne Titel' })),
            video.channelId
                ? el('a', { class: 'card-channel', href: `#/channel/${video.channelId}`, text: video.channelTitle ?? '' })
                : el('span', { class: 'card-channel', text: video.channelTitle ?? '' }),
            el('p', {
                class: 'card-meta',
                text: joinMeta(formatViews(video.viewCount), formatPublished(video.publishedAt))
            })
        ])
    ]);
}

/** Platzhalter während des Ladens – vermeidet ein springendes Layout. */
function skeletonGrid(count = 8) {
    const cards = Array.from({ length: count }, () =>
        el('div', {}, [
            el('div', { class: 'skeleton-thumb' }),
            el('div', { class: 'skeleton-line' }),
            el('div', { class: 'skeleton-line short' })
        ]));
    return el('div', { class: 'grid' }, cards);
}

/** Einheitliche Fehlerdarstellung – nutzt die erklärende Meldung des Backends. */
function errorNotice(error) {
    const isQuota = error instanceof ApiError && error.code === 'quota_exceeded';
    return el('div', { class: 'notice notice-error' }, [
        el('strong', { text: isQuota ? 'Tageskontingent aufgebraucht' : 'Das hat nicht geklappt' }),
        el('p', { text: error.message })
    ]);
}

function emptyNotice(text) {
    return el('div', { class: 'notice' }, el('strong', { text }));
}

/**
 * Rendert eine Videoliste mit Nachladen über den Seiten-Cursor der YouTube-API.
 *
 * @param {HTMLElement} container Zielcontainer
 * @param {object} options
 * @param {string} options.title    Überschrift
 * @param {string} [options.subtitle]
 * @param {Node}   [options.header] optionaler Kopfbereich (z. B. Kanalprofil)
 * @param {(pageToken: string|null) => Promise<object>} options.loader
 */
async function renderFeed(container, { title, subtitle, header, loader }) {
    const grid = el('div', { class: 'grid' });
    const footer = el('div', { class: 'load-more' });

    replace(container,
        header ?? null,
        title ? el('h1', { class: 'page-title', text: title }) : null,
        subtitle ? el('p', { class: 'page-subtitle', text: subtitle }) : null,
        skeletonGrid());

    const loadPage = async (pageToken, isFirst) => {
        try {
            const page = await loader(pageToken);

            if (isFirst) {
                replace(container,
                    header ?? null,
                    title ? el('h1', { class: 'page-title', text: title }) : null,
                    subtitle ? el('p', { class: 'page-subtitle', text: subtitle }) : null,
                    page.items.length ? grid : emptyNotice('Dazu wurde nichts gefunden.'),
                    footer);
            }

            grid.append(...page.items.map(videoCard));
            replace(footer, page.nextPageToken
                ? el('button', {
                    type: 'button',
                    text: 'Mehr laden',
                    onclick: (event) => {
                        event.currentTarget.disabled = true;
                        loadPage(page.nextPageToken, false);
                    }
                })
                : null);
        } catch (error) {
            if (isFirst) replace(container, errorNotice(error));
            else replace(footer, errorNotice(error));
        }
    };

    await loadPage(null, true);
}

/* --------------------------------------------------------------------- Seiten */

/** Startseite: beliebte Videos statt personalisierter Empfehlungen. */
export function renderHome(container, regionCode) {
    return renderFeed(container, {
        title: 'Aktuell beliebt',
        subtitle: `Meistgesehene Videos${regionCode ? ` in ${regionCode}` : ''} – ohne personalisierte Empfehlungen.`,
        loader: (pageToken) => fetchTrending(pageToken)
    });
}

/** Suchergebnisse. */
export function renderSearch(container, query) {
    return renderFeed(container, {
        title: `Suche: ${query}`,
        subtitle: 'Ergebnisse der offiziellen YouTube-Suche.',
        loader: (pageToken) => fetchSearch(query, pageToken)
    });
}

/** Kanalseite: Profil und chronologische Uploads. */
export async function renderChannel(container, channelId) {
    replace(container, skeletonGrid(4));

    let channel;
    try {
        channel = await fetchChannel(channelId);
    } catch (error) {
        replace(container, errorNotice(error));
        return;
    }

    const header = el('section', { class: 'channel-header' }, [
        channel.thumbnailUrl
            ? el('img', {
                class: 'channel-avatar', src: channel.thumbnailUrl, alt: '',
                loading: 'lazy', referrerpolicy: 'no-referrer'
            })
            : null,
        el('div', {}, [
            el('h1', { class: 'channel-name', text: channel.title ?? 'Kanal' }),
            el('p', {
                class: 'channel-stats',
                text: joinMeta(
                    channel.subscriberCount !== undefined && channel.subscriberCount !== null
                        ? `${formatCount(channel.subscriberCount)} Abonnenten` : null,
                    channel.videoCount !== undefined && channel.videoCount !== null
                        ? `${formatCount(channel.videoCount)} Videos` : null)
            })
        ])
    ]);

    await renderFeed(container, {
        header,
        title: 'Videos',
        loader: (pageToken) => fetchChannelVideos(channelId, pageToken)
    });
}

/** Wiedergabeseite. */
export async function renderWatch(container, videoId) {
    disposeActivePlayer();

    const mount = el('div');
    const frame = el('div', { class: 'player-frame' }, mount);
    replace(container, el('div', { class: 'watch' }, [frame, el('div', { class: 'skeleton-line' })]));

    let video;
    try {
        video = await fetchVideo(videoId);
    } catch (error) {
        replace(container, errorNotice(error));
        return;
    }

    // Sponsor-Abschnitte sind eine Zusatzfunktion: Fällt die Community-API aus,
    // läuft das Video trotzdem – nur eben ohne Sprungmarken.
    const segments = await fetchSkipSegments(videoId).catch(() => []);

    const player = new CleanPlayer(mount, videoId);
    player.setSegments(segments);
    activePlayer = player;

    const skipToggle = el('input', {
        type: 'checkbox', id: 'skip-toggle', checked: true,
        onchange: (event) => player.setSkipEnabled(event.currentTarget.checked)
    });

    const description = el('div', { class: 'description', text: video.description ?? '' });
    const descriptionToggle = el('button', {
        class: 'description-toggle', type: 'button', text: 'Beschreibung ausklappen',
        onclick: (event) => {
            const open = description.classList.toggle('open');
            event.currentTarget.textContent = open ? 'Beschreibung einklappen' : 'Beschreibung ausklappen';
        }
    });

    replace(container, el('div', { class: 'watch' }, [
        frame,
        el('h1', { class: 'watch-title', text: video.title ?? 'Ohne Titel' }),
        el('div', { class: 'watch-bar' }, [
            el('a', { class: 'watch-channel', href: `#/channel/${video.channelId}`, text: video.channelTitle ?? '' }),
            el('span', {
                class: 'watch-stats',
                text: joinMeta(
                    formatViews(video.viewCount),
                    video.likeCount !== undefined && video.likeCount !== null
                        ? `${formatCount(video.likeCount)} Likes` : null,
                    formatPublished(video.publishedAt))
            }),
            el('div', { class: 'watch-actions' }, [
                segments.length
                    ? el('label', { class: 'switch', for: 'skip-toggle' }, [
                        skipToggle, el('span', { text: 'Sponsor-Abschnitte überspringen' })])
                    : el('span', { class: 'badge', text: 'Keine Sponsor-Abschnitte gemeldet' })
            ])
        ]),
        segments.length ? segmentList(segments) : null,
        video.description ? description : null,
        video.description ? descriptionToggle : null
    ]));

    try {
        await player.mountPlayer();
    } catch (error) {
        replace(frame, el('div', { class: 'notice notice-error' }, [
            el('strong', { text: 'Player nicht verfügbar' }),
            el('p', { text: error.message })
        ]));
    }
}

/** Übersicht der erkannten Sponsor-Abschnitte – macht das Überspringen nachvollziehbar. */
function segmentList(segments) {
    return el('section', { class: 'segments' }, [
        el('h2', { text: `${segments.length} Abschnitt(e) werden übersprungen` }),
        el('ul', {}, segments.map((segment) => el('li', {
            text: `${formatSeconds(segment.startSeconds)}–${formatSeconds(segment.endSeconds)} · ${categoryLabel(segment.category)}`
        }))),
        el('p', { text: 'Quelle: SponsorBlock. Gemeint sind vom Creator selbst eingebaute Werbeblöcke, nicht die Anzeigen von YouTube.' })
    ]);
}

/** Unbekannte Route. */
export function renderNotFound(container) {
    replace(container, el('div', { class: 'notice' }, [
        el('strong', { text: 'Seite nicht gefunden' }),
        el('p', {}, el('a', { href: '#/', text: 'Zur Startseite' }))
    ]));
}
