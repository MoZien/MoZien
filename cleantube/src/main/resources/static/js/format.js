/** Formatierung aller Zahlen- und Zeitangaben in deutscher Schreibweise. */

const compactNumber = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const fullDate = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/**
 * Wandelt eine Laufzeit in Sekunden in `M:SS` bzw. `H:MM:SS`.
 *
 * Das Backend liefert Laufzeiten bewusst als schlichte Sekundenzahl.
 *
 * @param {number|null|undefined} seconds Laufzeit in Sekunden
 * @returns {string|null} `null`, wenn keine Laufzeit vorliegt (z. B. Livestream)
 */
export function formatSeconds(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;

    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n) => String(n).padStart(2, '0');

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** `1234567` → `"1,2 Mio."` */
export function formatCount(value) {
    if (value === null || value === undefined) return null;
    return compactNumber.format(value);
}

/** `1234567` → `"1,2 Mio. Aufrufe"` */
export function formatViews(value) {
    const formatted = formatCount(value);
    return formatted === null ? null : `${formatted} Aufrufe`;
}

/**
 * Zeitpunkt als möglichst kurze, lesbare Angabe.
 * Innerhalb eines Jahres relativ ("vor 3 Tagen"), danach als Datum.
 */
export function formatPublished(isoDate) {
    if (!isoDate) return null;
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return null;

    const diffSeconds = (date.getTime() - Date.now()) / 1000;
    const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60]
    ];

    if (Math.abs(diffSeconds) > 31536000) return fullDate.format(date);

    for (const [unit, secondsPerUnit] of units) {
        if (Math.abs(diffSeconds) >= secondsPerUnit) {
            return relative.format(Math.round(diffSeconds / secondsPerUnit), unit);
        }
    }
    return relative.format(Math.round(diffSeconds), 'second');
}

/** Verbindet vorhandene Angaben mit einem Trennpunkt und lässt fehlende weg. */
export function joinMeta(...parts) {
    return parts.filter(Boolean).join(' · ');
}

/** Deutsche Bezeichnungen der SponsorBlock-Kategorien. */
const CATEGORY_LABELS = {
    sponsor: 'Bezahlte Sponsor-Werbung',
    selfpromo: 'Eigenwerbung',
    interaction: 'Aufruf zu Abo/Like',
    intro: 'Vorspann',
    outro: 'Abspann',
    preview: 'Vorschau',
    music_offtopic: 'Musikpause'
};

export function categoryLabel(category) {
    return CATEGORY_LABELS[category] ?? category;
}
