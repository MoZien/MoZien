/**
 * Zugriff auf das CleanTube-Backend.
 *
 * Das Frontend spricht ausschließlich mit dieser eigenen API und nie direkt mit
 * Google. Der YouTube-API-Key bleibt dadurch serverseitig; im Browser wäre er
 * öffentlich einsehbar und für Dritte auf Kosten des Projekts nutzbar.
 */

/** Fehler mit HTTP-Status und der vom Backend gelieferten Erklärung. */
export class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

async function request(path, params = {}) {
    const url = new URL(path, window.location.origin);
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, value);
        }
    }

    let response;
    try {
        response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (cause) {
        throw new ApiError(0, 'network_error', 'Das Backend ist nicht erreichbar.');
    }

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(
            response.status,
            body.error ?? 'error',
            body.message ?? `Die Anfrage ist fehlgeschlagen (HTTP ${response.status}).`
        );
    }
    return response.json();
}

/** Aktuell beliebte Videos. */
export const fetchTrending = (pageToken) => request('/api/videos', { pageToken });

/** Volltextsuche. */
export const fetchSearch = (query, pageToken) => request('/api/search', { q: query, pageToken });

/** Daten der Wiedergabeseite. */
export const fetchVideo = (videoId) => request(`/api/videos/${encodeURIComponent(videoId)}`);

/** Kanal-Stammdaten. */
export const fetchChannel = (channelId) => request(`/api/channels/${encodeURIComponent(channelId)}`);

/** Videos eines Kanals. */
export const fetchChannelVideos = (channelId, pageToken) =>
    request(`/api/channels/${encodeURIComponent(channelId)}/videos`, { pageToken });

/** Zu überspringende Abschnitte eines Videos. */
export const fetchSkipSegments = (videoId) =>
    request(`/api/videos/${encodeURIComponent(videoId)}/skip-segments`);

/** Funktionsschalter und Quota-Stand. */
export const fetchStatus = () => request('/api/status');
