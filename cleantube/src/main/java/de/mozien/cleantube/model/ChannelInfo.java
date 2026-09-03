package de.mozien.cleantube.model;

/**
 * Stammdaten eines Kanals.
 *
 * @param id              Kanal-ID (beginnt ueblicherweise mit {@code UC})
 * @param title           Kanalname
 * @param description     Kanalbeschreibung
 * @param thumbnailUrl    Kanalbild
 * @param subscriberCount Abonnenten; {@code null}, wenn der Kanal sie verbirgt
 * @param videoCount      Anzahl oeffentlicher Videos
 * @param uploadsPlaylist ID der automatisch gepflegten "Uploads"-Playlist. Ueber sie lassen
 *                        sich die Videos eines Kanals fuer 1 statt 100 Quota-Einheiten laden.
 */
public record ChannelInfo(
        String id,
        String title,
        String description,
        String thumbnailUrl,
        Long subscriberCount,
        Long videoCount,
        String uploadsPlaylist) {
}
