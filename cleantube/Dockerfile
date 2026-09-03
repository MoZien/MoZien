# Mehrstufiger Build: Das fertige Abbild enthaelt nur die Laufzeit, nicht das Build-Werkzeug.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Erst nur die pom.xml kopieren: So bleibt die Abhaengigkeits-Schicht im Docker-Cache
# erhalten, solange sich die Abhaengigkeiten nicht aendern.
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Nicht als root laufen lassen.
RUN addgroup -S cleantube && adduser -S cleantube -G cleantube
USER cleantube

COPY --from=build /build/target/cleantube-*.jar app.jar

EXPOSE 8080
# Der API-Key wird beim Start uebergeben, nicht ins Abbild gebacken:
#   docker run -e YOUTUBE_API_KEY=... -p 8080:8080 cleantube
ENTRYPOINT ["java", "-jar", "app.jar"]
