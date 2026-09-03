package de.mozien.cleantube.youtube;

/** Die angefragte Ressource (Video oder Kanal) existiert nicht oder ist nicht oeffentlich. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
